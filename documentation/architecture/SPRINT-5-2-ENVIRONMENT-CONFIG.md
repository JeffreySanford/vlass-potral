# Sprint 5.2: Kafka Environment Configuration

**Date**: February 14, 2026  
**Status**: Week 1 Complete - KafkaService Implementation Done ✅

---

## Environment Variables

Add these to `.env` and `.env.local`:

```bash
# Kafka Cluster Configuration
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_CLIENT_ID=cosmic-horizons-api
KAFKA_CONNECTION_TIMEOUT_MS=5000
KAFKA_REQUEST_TIMEOUT_MS=10000
KAFKA_COMPRESSION_TYPE=snappy

# Consumer Group Configuration
KAFKA_CONSUMER_GROUP_ID=cosmic-horizons-event-processor
KAFKA_AUTO_COMMIT_INTERVAL_MS=5000
KAFKA_SESSION_TIMEOUT_MS=30000

# Schema Registry (Optional - Phase 5.2.5+)
SCHEMA_REGISTRY_URL=http://localhost:8081
SCHEMA_REGISTRY_CACHE_SIZE=100

# Event Publishing Configuration
KAFKA_JOB_LIFECYCLE_TOPIC=job-lifecycle
KAFKA_JOB_METRICS_TOPIC=job-metrics
KAFKA_NOTIFICATIONS_TOPIC=notifications
KAFKA_AUDIT_TRAIL_TOPIC=audit-trail
KAFKA_SYSTEM_HEALTH_TOPIC=system-health

# Producer Configuration
KAFKA_PRODUCER_RETRIES=5
KAFKA_PRODUCER_BATCH_SIZE=16384
KAFKA_PRODUCER_LINGER_MS=10
KAFKA_IDEMPOTENT_PRODUCER=true

# Consumer Configuration
KAFKA_CONSUMER_MAX_POLL_RECORDS=500
KAFKA_CONSUMER_FETCH_MIN_BYTES=1024
KAFKA_CONSUMER_FETCH_MAX_WAIT_MS=500
```

---

## Docker Compose

Add to `docker-compose.yml` or create `docker-compose.events.yml`:

```yaml
version: '3.8'

services:
  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    container_name: kafka-1
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka-1:29092,PLAINTEXT_HOST://localhost:9092'
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_OFFSETS_RETENTION_MINUTES: 10080  # 7 days
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'
      KAFKA_LOG_RETENTION_HOURS: 720  # 30 days default
      KAFKA_LOG_SEGMENT_BYTES: 1073741824  # 1GB
      KAFKA_LOG_CLEANUP_POLICY: 'delete'
      KAFKA_LOG_CLEANUP_CHECK_INTERVAL_MS: 60000
      KAFKA_REPLICA_LAG_TIME_MAX_MS: 10000
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_COMPRESSION_TYPE: 'snappy'
      KAFKA_UNCLEAN_LEADER_ELECTION_ENABLE: 'false'
    ports:
      - '9092:9092'
    networks:
      - cosmic-horizons
    healthcheck:
      test: ['CMD', 'kafka-broker-api-versions.sh', '--bootstrap-server', 'localhost:9092']
      interval: 5s
      timeout: 10s
      retries: 5

  kafka-2:
    image: confluentinc/cp-kafka:7.5.0
    container_name: kafka-2
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka-2:29093,PLAINTEXT_HOST://localhost:9093'
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'
      KAFKA_LOG_RETENTION_HOURS: 720
      KAFKA_COMPRESSION_TYPE: 'snappy'
    ports:
      - '9093:9093'
    networks:
      - cosmic-horizons
    healthcheck:
      test: ['CMD', 'kafka-broker-api-versions.sh', '--bootstrap-server', 'localhost:9093']
      interval: 5s
      timeout: 10s
      retries: 5

  kafka-3:
    image: confluentinc/cp-kafka:7.5.0
    container_name: kafka-3
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka-3:29094,PLAINTEXT_HOST://localhost:9094'
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'
      KAFKA_LOG_RETENTION_HOURS: 720
      KAFKA_COMPRESSION_TYPE: 'snappy'
    ports:
      - '9094:9094'
    networks:
      - cosmic-horizons
    healthcheck:
      test: ['CMD', 'kafka-broker-api-versions.sh', '--bootstrap-server', 'localhost:9094']
      interval: 5s
      timeout: 10s
      retries: 5

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
      ZOOKEEPER_SYNC_LIMIT: 5
      ZOOKEEPER_INIT_LIMIT: 10
    ports:
      - '2181:2181'
    networks:
      - cosmic-horizons
    healthcheck:
      test: ['CMD', 'echo', 'ruok', '|', 'nc', 'localhost', '2181']
      interval: 5s
      timeout: 10s
      retries: 5

  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    container_name: schema-registry
    depends_on:
      - kafka-1
      - kafka-2
      - kafka-3
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: 'PLAINTEXT://kafka-1:29092,PLAINTEXT://kafka-2:29093,PLAINTEXT://kafka-3:29094'
      SCHEMA_REGISTRY_LISTENERS: 'http://0.0.0.0:8081'
      SCHEMA_REGISTRY_KAFKASTORE_TOPIC_REPLICATION_FACTOR: 3
      SCHEMA_REGISTRY_DEBUG: 'false'
    ports:
      - '8081:8081'
    networks:
      - cosmic-horizons
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8081/subjects']
      interval: 5s
      timeout: 10s
      retries: 5

networks:
  cosmic-horizons:
    name: cosmic-horizons
    driver: bridge
```

---

## Startup Commands

### Local Development

```bash
# Start all infrastructure
pnpm run start:infra

# Start Kafka cluster only
docker compose up -d zookeeper kafka-1 kafka-2 kafka-3 schema-registry

# Verify Kafka is healthy
docker compose ps

# Check broker status
docker exec kafka-1 kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### CI/CD Pipeline

```bash
# GitHub Actions will use docker-compose in CI
# See: .github/workflows/ci.yml

# Reset and restart infrastructure
pnpm run start:infra:reset
```

---

## Topic Verification

### List Topics

```bash
docker exec kafka-1 kafka-topics.sh --list \
  --bootstrap-server localhost:9092

# Expected output:
# __consumer_offsets
# audit-trail
# job-lifecycle
# job-metrics
# notifications
# system-health
```

### Describe Topic

```bash
docker exec kafka-1 kafka-topics.sh --describe \
  --topic job-lifecycle \
  --bootstrap-server localhost:9092
```

### Create Topic Manually (if needed)

```bash
docker exec kafka-1 kafka-topics.sh --create \
  --topic job-lifecycle \
  --partitions 10 \
  --replication-factor 3 \
  --bootstrap-server localhost:9092 \
  --config retention.ms=2592000000 \
  --config compression.type=snappy \
  --config min.insync.replicas=2
```

---

## Consumer Group Monitoring

### List Consumer Groups

```bash
docker exec kafka-1 kafka-consumer-groups.sh --list \
  --bootstrap-server localhost:9092
```

### Check Group Status

```bash
docker exec kafka-1 kafka-consumer-groups.sh --describe \
  --group cosmic-horizons-event-processor \
  --bootstrap-server localhost:9092
```

### Reset Offsets (Development Only)

```bash
docker exec kafka-1 kafka-consumer-groups.sh --reset-offsets \
  --group cosmic-horizons-event-processor \
  --topic job-lifecycle \
  --to-earliest \
  --bootstrap-server localhost:9092 \
  --execute
```

---

## Performance Tuning

### Broker Configuration

- **Replication Factor**: 3 for high availability
- **Min In-Sync Replicas**: 2 to prevent data loss
- **Compression**: Snappy (good balance of speed/ratio)
- **Retention**: 30 days (job-lifecycle), 90 days (audit-trail)
- **Cleanup Policy**: Delete (performance)

### Producer Configuration

- **Idempotent Producer**: Enabled (exactly-once semantics)
- **Batch Size**: 16KB default
- **Linger Time**: 10ms for throughput optimization
- **Compression**: Applied at message batch level

### Consumer Configuration

- **Max Poll Records**: 500 per fetch
- **Min Fetch Size**: 1KB to reduce network overhead
- **Max Wait Time**: 500ms for batching

---

## Troubleshooting

### Connection Failed

```bash
# Check broker connectivity
nc -zv localhost 9092
nc -zv localhost 9093
nc -zv localhost 9094

# Check Docker network
docker network inspect cosmic-horizons
```

### Topic Not Created

```bash
# Check admin logs
docker logs kafka-1 | tail -50

# Verify brokers are up
docker exec kafka-1 \
  kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### Consumer Lag

```bash
# Monitor lag
docker exec kafka-1 kafka-consumer-groups.sh --describe \
  --group cosmic-horizons-event-processor \
  --bootstrap-server localhost:9092
```

---

## Week 1 Implementation Checklist

✅ **Component 1**: KafkaService implementation (397 lines)

- Connect to 3-broker cluster
- Handle producer configuration with idempotence
- Create topics on startup with proper retention policies
- Publish to 5 topics (job-lifecycle, metrics, notifications, audit-trail, system-health)
- Consumer group support
- Cluster stats and health checks
- Graceful disconnect on module destruction

✅ **Component 2**: Topic definitions with metadata

- 5 Kafka topics with retention policies
- 5 consumer group configurations
- Helper functions for topic validation

✅ **Component 3**: Avro schemas (5 files)

- job-lifecycle.avsc: Job state transitions
- job-metrics.avsc: Performance metrics
- notifications.avsc: User notifications
- audit-trail.avsc: Compliance audit trail
- system-health.avsc: Infrastructure health

✅ **Component 4**: Module integration

- KafkaService already exported from EventsModule
- Ready for injection into consuming services

✅ **Component 5**: Environment configuration

- All necessary environment variables documented
- Docker Compose setup for 3-broker cluster + Schema Registry
- Health checks on all containers
- Local and CI startup commands

---

## Next Steps (Week 2)

- [ ] Create test builders (KafkaEventBuilder, MockKafkaPublisher, etc.)
- [ ] Write 40+ tests for producer, consumer, performance
- [ ] Add Schema Registry integration tests
- [ ] Performance validation: 1000+ events/sec target

**Status**: Ready to proceed to Week 2 test infrastructure
