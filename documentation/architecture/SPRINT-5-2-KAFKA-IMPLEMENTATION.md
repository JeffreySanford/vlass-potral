# Sprint 5.2: Kafka Integration - Implementation Guide

**Duration**: 3 weeks (Starting Feb 14, 2026)  
**Goal**: Implement KafkaService for 1000+ events/sec throughput  
**Target Completion**: March 7, 2026

---

## Quick Overview

Phase 3 Sprint 5.1 (RabbitMQ) is complete with 57 passing tests. Sprint 5.2 adds Kafka for durable, high-throughput event storage with Schema Registry integration. This enables the real-time dashboards (Sprint 6) to replay historical events and maintain audit compliance.

**Architecture Decision** (see ADR-EVENT-STREAMING.md):

- **RabbitMQ**: Ephemeral events (real-time, no persistence) - subscribers must be connected
- **Kafka**: Durable events (30-90 day retention, searchable, replay-capable)

---

## File Structure to Create

```text
apps/cosmic-horizons-api/src/app/modules/events/
├── kafka.service.ts                          [NEW - 260 lines]
├── kafka/                                    [NEW]
│   ├── topics.ts                             [NEW - topic definitions]
│   └── schemas/                              [NEW]
│       ├── job-lifecycle.avsc                [NEW - Avro schema]
│       ├── job-metrics.avsc                  [NEW]
│       ├── notifications.avsc                [NEW]
│       └── audit-trail.avsc                  [NEW]
├── test/
│   ├── kafka-test-builders.ts                [NEW - 280+ lines]
│   ├── kafka.service.spec.ts                 [NEW - 350+ lines]
│   └── kafka-test-container.ts               [NEW - 120 lines utility]
└── events.module.ts                          [MODIFY - add KafkaService]
```

---

## Week 1: KafkaService Client & Topics

### Day 1-2: KafkaService Core (kafka.service.ts - 260 lines)

```typescript
// apps/cosmic-horizons-api/src/app/modules/events/kafka.service.ts

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, Admin, EachMessagePayload } from 'kafkajs';
import { EventBase } from '@cosmic-horizons/event-models';

/**
 * KafkaService
 * 
 * Handles Kafka 3-broker cluster connection and durable event publishing
 * 
 * Sprint 5.2 Goals:
 * - 3-broker cluster with Zookeeper coordination
 * - Schema Registry integration (Avro schemas)
 * - 1000+ events/second throughput
 * - Topic partitioning by job_id for message ordering
 * - Consumer group management for replay capability
 * - Offset management in PostgreSQL (enable "replay from date")
 */
@Injectable()
export class KafkaService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private admin: Admin | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private connected = false;

  // Topic names
  private readonly JOB_LIFECYCLE_TOPIC = 'job-lifecycle';      // 3 partitions, 30-day retention
  private readonly JOB_METRICS_TOPIC = 'job-metrics';          // 2 partitions, 7-day retention
  private readonly NOTIFICATIONS_TOPIC = 'notifications';      // 1 partition, 7-day retention
  private readonly AUDIT_TRAIL_TOPIC = 'audit-trail';          // 3 partitions, 90-day retention

  constructor(private readonly configService: ConfigService) {}

  /**
   * Connect to Kafka cluster
   * Required: KAFKA_BROKERS env var (comma-separated: localhost:9092,localhost:9093,localhost:9094)
   */
  async connect(): Promise<void> {
    this.logger.log('Connecting to Kafka cluster...');

    try {
      const brokers = this.configService.get('KAFKA_BROKERS', 'localhost:9092').split(',');
      
      this.kafka = new Kafka({
        clientId: 'cosmic-horizons-api',
        brokers: brokers.map(b => b.trim()),
        connectionTimeout: 5000,
        requestTimeout: 10000,
        retry: {
          retries: 5,
          initialRetryTime: 100,
          maxRetryTime: 1000,
        },
      });

      // Initialize producer
      this.producer = this.kafka.producer({
        transactionTimeout: 60000,
        idempotent: true, // Enable idempotent producer
        maxInFlightRequests: 5,
        compression: CompressionTypes.GZIP,
      });

      await this.producer.connect();
      this.logger.log('Kafka producer connected');

      // Initialize admin
      this.admin = this.kafka.admin();
      await this.admin.connect();
      this.logger.log('Kafka admin client connected');

      // Create topics if they don't exist
      await this.createTopics();

      // Create default consumer group for event processing
      await this.createConsumerGroup('event-processor');

      this.connected = true;
      this.logger.log('Kafka cluster connection established');
    } catch (error) {
      this.logger.error('Failed to connect to Kafka', error);
      throw error;
    }
  }

  /**
   * Create Kafka topics if they don't exist
   * Topics with different retention policies and replication factors
   */
  private async createTopics(): Promise<void> {
    if (!this.admin) throw new Error('Admin client not initialized');

    try {
      const topics = [
        {
          name: this.JOB_LIFECYCLE_TOPIC,
          numPartitions: 3,     // Partition by job_id for ordering
          replicationFactor: 3,
          configEntries: [
            { name: 'retention.ms', value: '2592000000' }, // 30 days
            { name: 'compression.type', value: 'gzip' },
            { name: 'min.insync.replicas', value: '2' },
          ],
        },
        {
          name: this.JOB_METRICS_TOPIC,
          numPartitions: 2,
          replicationFactor: 3,
          configEntries: [
            { name: 'retention.ms', value: '604800000' }, // 7 days
            { name: 'compression.type', value: 'gzip' },
          ],
        },
        {
          name: this.NOTIFICATIONS_TOPIC,
          numPartitions: 1,      // Single partition for broadcast
          replicationFactor: 3,
          configEntries: [
            { name: 'retention.ms', value: '604800000' }, // 7 days
          ],
        },
        {
          name: this.AUDIT_TRAIL_TOPIC,
          numPartitions: 3,
          replicationFactor: 3,
          configEntries: [
            { name: 'retention.ms', value: '7776000000' }, // 90 days for compliance
            { name: 'compression.type', value: 'gzip' },
            { name: 'min.insync.replicas', value: '2' },
          ],
        },
      ];

      // Create topics (will skip if already exist)
      const existingTopics = await this.admin.listTopics();
      const toCreate = topics.filter(t => !existingTopics.includes(t.name));

      if (toCreate.length > 0) {
        await this.admin.createTopics({
          topics: toCreate,
          validateOnly: false,
          timeout: 10000,
        });
        this.logger.log(`Created ${toCreate.length} topics`);
      } else {
        this.logger.log('All topics already exist');
      }
    } catch (error) {
      this.logger.warn('Failed to create topics (may already exist)', error);
      // Non-fatal - topics may already exist
    }
  }

  /**
   * Publish a job lifecycle event to Kafka
   * Keyed by job_id to ensure ordering within a job
   * Idempotent producer ensures exactly-once delivery
   */
  async publishJobLifecycleEvent(event: EventBase, jobId: string): Promise<void> {
    if (!this.connected || !this.producer) {
      throw new Error('Kafka not connected');
    }

    try {
      const message = {
        key: jobId, // Ensures ordering for this job
        value: JSON.stringify(event),
        headers: {
          'content-type': 'application/json',
          'correlation-id': event.correlation_id,
          'timestamp': event.timestamp,
        },
      };

      const result = await this.producer.send({
        topic: this.JOB_LIFECYCLE_TOPIC,
        messages: [message],
        timeout: 10000,
        compression: CompressionTypes.GZIP,
      });

      this.logger.debug(`Job lifecycle event published: ${event.event_type} (partition: ${result[0].partition})`);
    } catch (error) {
      this.logger.error(`Failed to publish job lifecycle event: ${event.event_type}`, error);
      throw error;
    }
  }

  /**
   * Publish performance metrics
   * Key: job_id for correlation
   */
  async publishJobMetrics(metrics: any, jobId: string): Promise<void> {
    if (!this.connected || !this.producer) {
      throw new Error('Kafka not connected');
    }

    try {
      await this.producer.send({
        topic: this.JOB_METRICS_TOPIC,
        messages: [{
          key: jobId,
          value: JSON.stringify(metrics),
          headers: {
            'timestamp': new Date().toISOString(),
          },
        }],
      });

      this.logger.debug(`Metrics published for job: ${jobId}`);
    } catch (error) {
      this.logger.error(`Failed to publish metrics for job: ${jobId}`, error);
      throw error;
    }
  }

  /**
   * Publish notification event
   */
  async publishNotificationEvent(event: EventBase): Promise<void> {
    if (!this.connected || !this.producer) {
      throw new Error('Kafka not connected');
    }

    try {
      await this.producer.send({
        topic: this.NOTIFICATIONS_TOPIC,
        messages: [{
          key: null, // Broadcast to all consumers
          value: JSON.stringify(event),
          headers: {
            'correlation-id': event.correlation_id,
            'timestamp': event.timestamp,
          },
        }],
      });

      this.logger.debug(`Notification published: ${event.event_type}`);
    } catch (error) {
      this.logger.error(`Failed to publish notification: ${event.event_type}`, error);
      throw error;
    }
  }

  /**
   * Publish audit trail event (90-day retention)
   * Used for compliance and operational auditing
   */
  async publishAuditEvent(event: EventBase, resourceId: string): Promise<void> {
    if (!this.connected || !this.producer) {
      throw new Error('Kafka not connected');
    }

    try {
      await this.producer.send({
        topic: this.AUDIT_TRAIL_TOPIC,
        messages: [{
          key: resourceId,
          value: JSON.stringify(event),
          headers: {
            'correlation-id': event.correlation_id,
            'timestamp': event.timestamp,
            'resource-id': resourceId,
          },
        }],
      });

      this.logger.debug(`Audit event published: ${event.event_type}`);
    } catch (error) {
      this.logger.error(`Failed to publish audit event: ${event.event_type}`, error);
      throw error;
    }
  }

  /**
   * Create a consumer group for a service
   */
  async createConsumerGroup(groupId: string): Promise<Consumer> {
    if (!this.kafka) throw new Error('Kafka not initialized');

    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    this.consumers.set(groupId, consumer);
    this.logger.log(`Consumer group created: ${groupId}`);
    return consumer;
  }

  /**
   * Subscribe to a topic with a consumer group
   */
  async subscribe(
    groupId: string,
    topics: string[],
    handler: (message: EachMessagePayload) => Promise<void>
  ): Promise<void> {
    let consumer = this.consumers.get(groupId);
    if (!consumer) {
      consumer = await this.createConsumerGroup(groupId);
    }

    await consumer.subscribe({ topics, fromBeginning: false });
    await consumer.run({
      eachMessage: handler,
      partitionsConsumedConcurrently: 3,
    });

    this.logger.log(`Subscribed ${groupId} to topics: ${topics.join(', ')}`);
  }

  /**
   * Get Kafka cluster statistics
   */
  async getStats(): Promise<Record<string, unknown>> {
    if (!this.admin || !this.connected) {
      return { connected: false };
    }

    try {
      const cluster = await this.admin.describeCluster();
      const topics = await this.admin.listTopics();

      return {
        connected: this.connected,
        brokers: cluster.brokers.length,
        controller: cluster.controller,
        topics: topics.length,
        topicNames: topics,
      };
    } catch (error) {
      this.logger.error('Failed to get Kafka stats', error);
      return { connected: false, error: 'Failed to query stats' };
    }
  }

  /**
   * Disconnect from Kafka cluster
   */
  async disconnect(): Promise<void> {
    this.logger.log('Disconnecting from Kafka cluster...');

    try {
      if (this.producer) {
        await this.producer.disconnect();
        this.logger.log('Kafka producer disconnected');
      }

      if (this.admin) {
        await this.admin.disconnect();
        this.logger.log('Kafka admin disconnected');
      }

      for (const [groupId, consumer] of this.consumers) {
        await consumer.disconnect();
        this.logger.log(`Consumer group disconnected: ${groupId}`);
      }

      this.connected = false;
      this.logger.log('Kafka cluster disconnection complete');
    } catch (error) {
      this.logger.error('Failed to disconnect from Kafka', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }
}
```

### Day 3: Topic Definitions (kafka/topics.ts - 80 lines)

```typescript
// apps/cosmic-horizons-api/src/app/modules/events/kafka/topics.ts

export interface TopicConfig {
  name: string;
  partitions: number;
  replication: number;
  retention_ms: number;
  description: string;
}

export const KAFKA_TOPICS: Record<string, TopicConfig> = {
  JOB_LIFECYCLE: {
    name: 'job-lifecycle',
    partitions: 3,           // Partition by job_id for ordering
    replication: 3,          // 3x replication for availability
    retention_ms: 2592000000, // 30 days
    description: 'Job lifecycle events: submitted, status changed, completed, failed',
  },
  JOB_METRICS: {
    name: 'job-metrics',
    partitions: 2,
    replication: 3,
    retention_ms: 604800000, // 7 days
    description: 'Performance metrics: CPU, GPU, memory, I/O',
  },
  NOTIFICATIONS: {
    name: 'notifications',
    partitions: 1,           // Single partition for broadcast
    replication: 3,
    retention_ms: 604800000, // 7 days
    description: 'User notifications and alerts',
  },
  AUDIT_TRAIL: {
    name: 'audit-trail',
    partitions: 3,
    replication: 3,
    retention_ms: 7776000000, // 90 days for compliance
    description: 'Audit trail for compliance and operational auditing',
  },
};

export function getTopicConfig(topicName: string): TopicConfig | undefined {
  return Object.values(KAFKA_TOPICS).find(t => t.name === topicName);
}
```

### Day 4-5: Schema Registry Integration

Create Avro schema files for each event type:

```json
// kafka/schemas/job-lifecycle.avsc
{
  "type": "record",
  "namespace": "com.cosmic-horizons.events",
  "name": "JobLifecycleEvent",
  "fields": [
    {"name": "event_id", "type": "string"},
    {"name": "event_type", "type": "string"},
    {"name": "timestamp", "type": "string"},
    {"name": "correlation_id", "type": "string"},
    {"name": "user_id", "type": "string"},
    {"name": "schema_version", "type": "int"},
    {"name": "payload", "type": "string"} // JSON string for flexibility
  ]
}
```

---

## Week 2: Test Infrastructure & Builders

### Tests to Write (350+ lines, 40+ tests)

```text
✓ Producer Tests (15 tests)
  - Publish to job-lifecycle, metrics, notifications, audit-trail
  - KeyedMessage ordering (same job_id → same partition)
  - Idempotent delivery (no duplicates)
  - Compression validation
  - Header metadata

✓ Consumer Tests (12 tests)
  - Create consumer group
  - Subscribe to single topic
  - Subscribe to multiple topics
  - Offset reset behavior
  - Consumer lag tracking
  - Rebalance handling

✓ Performance Tests (5 tests)
  - Throughput: 1000+ events/sec
  - Latency: P99 < 150ms
  - Memory usage under load
  - GC pressure monitoring

✓ Schema Registry Tests (5 tests)
  - Schema registration
  - Schema compatibility
  - Avro serialization
  - Schema versioning

✓ Failure Scenario Tests (3 tests)
  - Broker down → reconnect
  - Producer timeout handling
  - Consumer group rebalance

Total: 40+ tests ensuring production readiness
```

### EventBuilderForKafka (280+ lines)

Extend existing EventFactory with Kafka-specific methods:

```typescript
// test/kafka-test-builders.ts

export class KafkaEventBuilder extends EventFactory {
  /**
   * Build event with Kafka routing key (job_id)
   */
  withKafkaPartition(jobId: string): KafkaEventBuilder {
    this.kafkaKey = jobId;
    return this;
  }

  /**
   * Build 1000+ event stream for throughput testing
   */
  static createEventStream(count: number): EventBase[] {
    const events: EventBase[] = [];
    for (let i = 0; i < count; i++) {
      events.push(
        EventFactory.jobSubmitted()
          .withJobId(`job-perf-${i}`)
          .build()
      );
    }
    return events;
  }
}
```

---

## Week 3: Integration Testing & Performance Validation

### Integration Test Suite (200+ lines)

Test full Kafka cluster with:

- Topic creation and configuration
- Producer + Consumer coordination
- Offset tracking
- Message ordering guarantees
- Replication factor validation

### Performance Validation

Run stress tests:

```bash
# Test 1: Throughput (target: 1000+ events/sec)
pnpm nx run cosmic-horizons-api:test --testFile="**/kafka-performance.spec.ts"

# Test 2: Latency (target: P99 < 150ms)
pnpm nx run cosmic-horizons-api:test --testFile="**/kafka-latency.spec.ts"

# Test 3: Reliability (target: 0 message loss)
pnpm nx run cosmic-horizons-api:test --testFile="**/kafka-failure.spec.ts"
```

---

## Environment Configuration

Add to `.env` and `docker-compose.events.yml`:

```bash
# .env
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
SCHEMA_REGISTRY_URL=http://localhost:8081
KAFKA_CONSUMER_GROUP=cosmic-horizons-api
KAFKA_COMPRESSION=gzip

# docker-compose.events.yml
services:
  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_REPLICA_LAG_TIME_MAX_MS: 10000
      
  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka-1:9092
      SCHEMA_REGISTRY_LISTENERS: http://0.0.0.0:8081
```

---

## Success Checklist

### By End of Week 1

- [ ] KafkaService compiles (0 errors)
- [ ] Topics created in Docker cluster
- [ ] Producer successfully publishes to each topic
- [ ] Consumer group created and can subscribe

### By End of Week 2

- [ ] 40+ tests written and passing
- [ ] EventBuilder utilities complete
- [ ] Schema Registry integration verified

### By End of Week 3

- [ ] Throughput validation: > 1000 events/sec ✓
- [ ] Latency validation: P99 < 150ms ✓
- [ ] All 40+ tests passing
- [ ] Failure scenarios handled gracefully
- [ ] Ready for Sprint 5.3 (Job Orchestration)

---

## Sprint 5.3 Dependency

Once Kafka service is verified working, integrate into Sprint 5.3:

1. JobOrchestratorService publishes to `job-lifecycle` topic
2. Metrics service publishes to `job-metrics` topic
3. Notification service consumes from both
4. Dashboard service subscribes to live updates

This enables real-time, durable event processing.

---

## Reference

- [Event Streaming ADR](ADR-EVENT-STREAMING.md)
- [Event Schema Definitions](EVENT-SCHEMA-DEFINITIONS.md)
- [Topology Documentation](EVENT-STREAMING-TOPOLOGY.md)
- [Phase 3-4 Strategy](PHASE-3-4-COMPLETION-STRATEGY.md)

**Status**: Sprint 5.1 Complete ✅ | Sprint 5.2 Starting Now 🚀
