# Kafka/RabbitMQ Integration Plan for Cosmic Horizons

## Current Architecture Assessment

### Current State

- **Message Queue**: Not currently integrated into backend (`cosmic-horizons-api`)
- **Event Bus Implementation**: Missing - no async event handling system in place
- **Job Queue System**: Basic job management exists (jobs component) but no distributed queue backend

### What Could Benefit from Message Queues

Based on the codebase analysis, these areas would benefit from async event-driven architecture:

#### 1. **Comment Processing Pipeline**

Currently synchronous:

- Comment creation → Audit logging → Post notifications
- Report processing → Moderation workflow → Email alerts

**With Message Queue:**

```plaintext
Create Comment Event
  ├─→ Audit Log Queue (async)
  ├─→ Notification Queue (email, in-app)
  ├─→ Search Index Queue (ElasticSearch/Solr indexing)
  └─→ Moderation Queue (spam/content filtering)
```plaintext

#### 2. **Job Processing System**

Currently in `/cosmic-horizons-api/src/app/jobs` but lacks:
- Distributed job execution
- Job retry logic
- Dead-letter queue handling
- Priority-based job scheduling

**Recommendation: Add RabbitMQ**
- Simpler initial setup for lightweight operations
- Better for microservices within same infrastructure

#### 3. **Data Pipeline for ngVLA Integration**

For the future ngVLA data firehose (7.5-8 GB/s):
- Data ingestion from telescopes
- Calibration job queuing (to CosmicAI/AlphaCal)
- Reconstruction task distribution
- Archive storage coordination

**Recommendation: Apache Kafka**
- High-throughput, low-latency processing
- Distributed, fault-tolerant architecture
- Event log for audit trail and replay
- Ideal for massive data streaming

---

## Recommended Implementation Strategy

### Phase 1: RabbitMQ for Internal Operations (Near-term)

**Timeline: 1-2 quarters before ngVLA operations**

#### Tasks

1. **Add RabbitMQ Module to NestJS Backend**
   ```bash
   npm install @nestjs/microservices amqplib
   ```

2. **Implement Event Producers**
   - CommentEventProducer (create/delete/report events)
   - AuditEventProducer (audit logging)
   - NotificationEventProducer (email/push notifications)

3. **Implement Event Consumers**
   - Async audit log writer
   - Email notification worker
   - Moderation queue processor
   - Search index updater

4. **Add Tests for Queue Operations**
   - Test message serialization/deserialization
   - Test error handling and retries
   - Test message ordering guarantees
   - Test dead-letter queue routing

#### Test Coverage Areas

```typescript
// RabbitMQ integration tests needed:
- Message publisher reliability
- Consumer error handling & retries
- Message ordering guarantees
- Connection resilience
- Queue declaration idempotency
- Dead-letter queue routing
```plaintext

### Phase 2: Kafka for Data Streaming (Medium-term)

**Timeline: 6-12 months before ngVLA operations**

#### Use Cases

1. **High-Volume Data Ingestion**
   - Raw visibility data from ngVLA correlator
   - Calibration metrics and diagnostics
   - RFI detection events

2. **Multi-Stage Processing Pipeline**
   - Stage 1: Data validation & routing
   - Stage 2: Direction-dependent calibration (AlphaCal)
   - Stage 3: Image reconstruction (GPU cluster)
   - Stage 4: Archive storage & catalog updates
   - Stage 5: Science-ready data products (SRDP) delivery

3. **Auditability and Reproducibility**
   - Kafka's log-based architecture ensures event replay
   - Trace data transformations through pipeline
   - Debug failed processing by replaying events
   - Meet explainability requirements from AGENTS.md

#### Architecture

```plaintext
ngVLA Telescope
     ↓
Data Ingestion Kafka Topic (raw-visibilities)
     ↓
├─→ Validation Consumer → Valid Data Topic
├─→ Anomaly Detection Consumer → Alerts Topic
└─→ Logging Consumer → Audit Topic
     ↓
AlphaCal Consumer (Direction-dependent calibration)
     ↓
Calibrated Data Topic
     ↓
GPU Reconstruction Consumer (Radio Image Reconstruction)
     ↓
Science Ready Data Topic
     ↓
Archive & Distribution Consumer
     ↓
User Portal (< 1s SSR first paint with pre-cached results)
```plaintext

---

## Testing Strategy

### Unit Tests (No Infrastructure Required)

```typescript
// Test message serialization
// Test queue configuration
// Test event schema validation
// Test error handling logic
// Test message ordering guarantees
```plaintext

### Integration Tests (Docker-based)

```bash

# Test with containerized RabbitMQ/Kafka

docker run -d --name rabbitmq -p 5672:5672 rabbitmq:latest
docker run -d --name kafka -p 9092:9092 confluentinc/cp-kafka:latest

# Test scenarios:

// Producer-consumer integration
// Message persistence
// Retry mechanism
// Dead-letter queue routing
// Consumer group coordination (Kafka)
```plaintext

### End-to-End Tests

```typescript
// Full pipeline: Event → Queue → Consumer → Result
// Concurrent producer/consumer scenarios
// Network failure recovery
// Message order verification (critical for calibration data)
```plaintext

---

## Kafka vs RabbitMQ Decision Matrix

| Aspect | RabbitMQ | Kafka |
|--------|----------|-------|
| **Setup Complexity** | Low | Moderate |
| **Throughput** | Medium (50k-100k msg/s) | Very High (1M+ msg/s) |
| **Latency** | Low (~1ms) | Low (~10ms) |
| **Data Persistence** | Optional (queues) | Mandatory (topics/log) |
| **Ordering Guarantees** | Per-queue only | Per-partition guaranteed |
| **Scalability** | Vertical | Horizontal (partitions) |
| **Memory Footprint** | Light | Moderate (requires broker cluster) |
| **Replaying Events** | Limited | Natural feature |
| **Monitoring** | Good | Excellent |
| **Best For** | Internal microservices | Data streaming & audit logs |

---

## Recommended Roadmap

### **Immediate (Now - Q2 2026)**

- ✅ Keep current synchronous architecture
- ✅ Build comprehensive test coverage (in progress)
- ✅ Document async patterns for future implementation
- ⏳ Create message queue abstraction layer (adapter pattern)

### **Near-term (Q3-Q4 2026)**

- 📋 Add RabbitMQ for comment notifications & audit logs
- 📋 Implement basic retry logic & dead-letter queues
- 📋 Add monitoring & alerting for queue health

### **Medium-term (Q1-Q3 2027)**

- 🎯 Add Kafka cluster for data streaming
- 🎯 Integrate with CosmicAI/AlphaCal (autonomous calibration)
- 🎯 Implement event replay and audit trail

### **Pre-ngVLA (Q4 2027 - Q1 2028)**

- 🔧 Load testing with simulated ngVLA data volumes
- 🔧 Multi-region Kafka deployment for federation
- 🔧 Disaster recovery & failover procedures

---

## Implementation Notes

### Technology Stack

- **Message Queue**: RabbitMQ (internal) + Kafka (data streaming)
- **Serialization**: JSON (RabbitMQ), Avro/Protobuf (Kafka)
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack (logs from queue workers)

### Compliance Considerations

- All queue infrastructure runs within secure network perimeter
- Message encryption for sensitive data (PII in audit logs)
- Audit trail logging required for compliance with radio astronomy data governance
- Retention policy: Keep messages for at least 30 days for debugging

### Known Constraints

- Initial deployment on shared infrastructure (not high-availability)
- No multi-region setup initially (consolidate at Charlottesville facility)
- Streaming at ngVLA scale requires upgrade to dedicated Kafka cluster

---

## Current Testing Gaps (Before Message Queue Implementation)

Priority areas to test BEFORE adding queue infrastructure:
1. ✅ Comment service/controller (46 + 38 tests = 84 tests)
2. ✅ Cache service for state management (39 tests)
3. ✅ Async operations in existing code (admin logs - 34 tests)
4. ⏳ Error handling and retry logic in services
5. ⏳ Integration between comment → audit → notifications workflows

Once these are solidified, message queue patterns will be much clearer to test.

---

## Conclusion

Kafka/RabbitMQ integration aligns with the **CosmicAI data firehose requirements** and the **Explainable Universe theme**. Starting with RabbitMQ for internal operations and upgrading to Kafka when ngVLA data arrives provides a clear evolution path while maintaining code testability and maintainability.

The current focus on comprehensive unit/integration test coverage ensures your backend is ready to handle both synchronous operations (today) and asynchronous event-driven workflows (tomorrow).
