# Sprint 5.3: Job Orchestration Events

## Execution Plan & Architecture

**Date**: February 15, 2026  
**Duration**: 3 weeks (Feb 15 - March 7, 2026)  
**Status**: 🟢 READY TO START  
**Dependencies**: Sprint 5.2 Kafka Infrastructure ✅ COMPLETE

---

## Executive Summary

Sprint 5.3 will integrate the fully-tested Kafka infrastructure from Sprint 5.2 with the job orchestration system, enabling event-driven workflows across the Cosmic Horizons platform. This enables:

- Real-time job status updates across all connected clients
- Durable audit trail for compliance (90-day retention)
- Multi-service coordination via event publishing/consumption
- Performance metrics aggregation
- Notification dispatch on job state changes

**Target Completion**: March 7, 2026 (3 weeks)  
**Success Criteria**: 50+ job event tests, 100% job lifecycle coverage, event replay validated

---

## Architecture Overview

### Event-Driven Job Lifecycle

```text
User Action
    ↓
JobOrchestratorService
    ├─→ Publish job.submitted → job-lifecycle topic (partition by job_id)
    │   └─→ Consumed by: NotificationService, MetricsService, AuditService
    │
    ├─→ Publish job.status_changed → job-lifecycle topic
    │   └─→ Consumed by: WebSocket Broadcast, Dashboard Real-time, Audit Trail
    │
    ├─→ Publish job.metrics → job-metrics topic (partition by job_id)
    │   └─→ Consumed by: MetricsAggregator, PerformanceDashboard
    │
    └─→ Publish job.completed/failed → job-lifecycle topic
        └─→ Consumed by: NotificationService (email), AuditService, Cleanup Service

All events include:
  - event_id: Unique identifier (UUID)
  - correlation_id: Tracing across services
  - timestamp: ISO 8601
  - user_id: Who initiated the action
  - partition_key: job_id (ensures ordering per job)
```

### Service Integration Points

**1. JobOrchestratorService** (Primary Publisher)

```typescript
constructor(
  private kafkaService: KafkaService,
  private taccService: TaccService,
  private jobRepository: JobRepository,
) {}

async submitJob(request: SubmitJobRequest): Promise<Job> {
  // 1. Create job record
  const job = await this.jobRepository.create(request);
  
  // 2. Publish job.submitted event
  await this.kafkaService.publishJobLifecycleEvent({
    event_type: 'job.submitted',
    job_id: job.id,
    user_id: request.userId,
    payload: { job details }
  }, job.id); // partition key
  
  // 3. Submit to TACC
  const taccResponse = await this.taccService.submit(job);
  
  // 4. Publish job.queued event
  await this.kafkaService.publishJobLifecycleEvent({
    event_type: 'job.queued',
    job_id: job.id,
    tac_job_id: taccResponse.job_id,
  }, job.id);
  
  return job;
}

async onJobStatusChange(event: JobStatusEvent): Promise<void> {
  // Called by polling or webhook from TACC
  await this.kafkaService.publishJobLifecycleEvent({
    event_type: 'job.status_changed',
    previous_status: event.from,
    current_status: event.to,
    job_id: event.jobId,
  }, event.jobId);
  
  // Update database
  await this.jobRepository.updateStatus(event.jobId, event.to);
}
```

**2. MetricsService** (Consumer + Publisher)

```typescript
// Subscribe to job-metrics topic
async startMetricsConsumer(): Promise<void> {
  await this.kafkaService.subscribeToJobMetrics(
    async (message: KafkaMessage<JobMetricsRecordedEvent>) => {
      // Aggregate metrics
      const aggregated = await this.aggregateMetrics(message.value);
      
      // Store in time-series database (InfluxDB/Prometheus)
      await this.storageService.writeMetrics(aggregated);
      
      // Broadcast to dashboard
      await this.websocketService.broadcast('metrics', aggregated);
    }
  );
}

// Publish metrics summary
async publishMetricsSummary(jobId: string, metrics: JobMetrics): Promise<void> {
  await this.kafkaService.publishJobMetrics({
    event_type: 'job.metrics_recorded',
    job_id: jobId,
    metrics: {
      cpu_usage: metrics.cpu,
      memory_usage: metrics.memory,
      io_operations: metrics.io,
      execution_time: metrics.duration,
    }
  }, jobId);
}
```

**3. NotificationService** (Consumer)

```typescript
// Subscribe to job-lifecycle topic
async startNotificationConsumer(): Promise<void> {
  await this.kafkaService.subscribeToJobLifecycle(
    async (message: KafkaMessage<JobLifecycleEvent>) => {
      // Only process terminal events
      if (['job.completed', 'job.failed'].includes(message.value.event_type)) {
        const notification = this.buildNotification(message.value);
        
        // Send email
        await this.emailService.send(notification);
        
        // Store in-app notification
        await this.notificationRepository.create(notification);
        
        // Broadcast to WebSocket
        await this.websocketService.notify(message.value.user_id, notification);
      }
    }
  );
}
```

**4. ComplianceAuditor** (Consumer)

```typescript
// Subscribe to audit-trail topic (90-day retention)
async startAuditConsumer(): Promise<void> {
  await this.kafkaService.subscribeToAuditTrail(
    async (message: KafkaMessage<AuditActionRecordedEvent>) => {
      // Store immutably in audit database
      await this.auditRepository.create({
        action: message.value.action,
        resource_id: message.value.resource_id,
        user_id: message.value.user_id,
        timestamp: message.value.timestamp,
        correlation_id: message.value.correlation_id,
        changes: message.value.changes,
      });
    }
  );
}
```

**5. SystemHealthService** (Consumer)

```typescript
// Subscribe to system-health topic (singleton partition, 7-day retention)
async startHealthConsumer(): Promise<void> {
  await this.kafkaService.subscribeToSystemHealth(
    async (message: KafkaMessage<SystemHealthCheckEvent>) => {
      // Update health metrics
      await this.healthRepository.recordCheck({
        broker_count: message.value.broker_count,
        topic_count: message.value.topic_count,
        consumer_lag: message.value.consumer_lag,
        error_rate: message.value.error_rate,
      });
      
      // Trigger alerts if degraded
      if (message.value.error_rate > 0.05) {
        await this.alertService.trigger('HIGH_ERROR_RATE', message.value);
      }
    }
  );
}
```

---

## Week-by-Week Execution Plan

### Week 1: Service Integration & Event Publishing

**Goal**: JobOrchestratorService publishes all job lifecycle events

**Tasks**:

1. **Day 1-2: JobOrchestratorService Integration**
   - [ ] Inject KafkaService into JobOrchestratorService
   - [ ] Remove RabbitMQ event publishing (use Kafka only)
   - [ ] Implement job.submitted event publishing
   - [ ] Implement job.queued event publishing
   - [ ] Implement job.running event publishing
   - [ ] Add partition key: job_id (for ordering guarantees)
   - [ ] Add correlation_id propagation
   - [ ] Add user_id from request context

2. **Day 3: Job Lifecycle Event Publishing**
   - [ ] Implement job.completed event publishing
   - [ ] Implement job.failed event publishing
   - [ ] Implement job.cancelled event publishing
   - [ ] Add error details to failed events
   - [ ] Add execution time to completed events
   - [ ] Add cancellation reason to cancelled events

3. **Day 4-5: Job Metrics Publishing**
   - [ ] Publish job.metrics_recorded events
   - [ ] Include CPU, memory, I/O metrics
   - [ ] Include execution time and resource usage
   - [ ] Batch multiple metric updates
   - [ ] Track metrics aggregation latency

**Tests Created** (15 tests):

```typescript
describe('JobOrchestratorService - Event Publishing', () => {
  // Publishing tests (10)
  it('should publish job.submitted event with partition key')
  it('should publish job.queued event after TACC submission')
  it('should publish job.running event on status change')
  it('should publish job.completed event with execution time')
  it('should publish job.failed event with error details')
  it('should publish job.cancelled event with reason')
  it('should include correlation_id in all events')
  it('should include user_id from request context')
  it('should batch metrics updates')
  it('should preserve job ordering via partition key')

  // Ordering tests (5)
  it('should maintain job state transitions order')
  it('should handle concurrent job submissions')
  it('should prevent out-of-order status updates')
  it('should support event replay')
  it('should recover from publish failures')
})
```

---

### Week 2: Consumer Integration & Event Handling

**Goal**: Services consume and handle job lifecycle events

**Tasks**:

1. **Day 1-2: MetricsService Consumer**
   - [ ] Create job-metrics consumer group
   - [ ] Subscribe to job-metrics topic
   - [ ] Aggregate metrics per job
   - [ ] Store in metrics database (InfluxDB)
   - [ ] Broadcast updates to dashboard
   - [ ] Track consumer lag

2. **Day 3: NotificationService Consumer**
   - [ ] Create job-notifications consumer group
   - [ ] Subscribe to job-lifecycle topic
   - [ ] Filter for terminal events (completed, failed)
   - [ ] Generate email notifications
   - [ ] Store in-app notifications
   - [ ] Broadcast via WebSocket

3. **Day 4: ComplianceAuditor Implementation**
   - [ ] Create audit-trail consumer group
   - [ ] Subscribe to audit-trail topic
   - [ ] Store all events immutably
   - [ ] Implement 90-day retention validation
   - [ ] Create audit trail query API
   - [ ] Generate compliance reports

4. **Day 5: SystemHealthMonitor**
   - [ ] Create system-health consumer group
   - [ ] Subscribe to system-health topic
   - [ ] Monitor error rates and lag
   - [ ] Trigger alerts on degradation
   - [ ] Update health dashboard

**Tests Created** (20 tests):

```typescript
describe('Consumer Services - Event Handling', () => {
  // MetricsService (5)
  it('should consume job.metrics_recorded events')
  it('should aggregate metrics by job_id')
  it('should broadcast metrics updates')
  it('should handle metric aggregation errors')
  it('should track consumer lag')

  // NotificationService (5)
  it('should consume terminal job events')
  it('should generate email for job.completed')
  it('should generate notification for job.failed')
  it('should broadcast WebSocket messages')
  it('should handle notification delivery failures')

  // ComplianceAuditor (5)
  it('should consume audit-trail events')
  it('should store events immutably')
  it('should enforce 90-day retention')
  it('should support audit trail queries')
  it('should generate compliance reports')

  // SystemHealthService (5)
  it('should monitor system health events')
  it('should alert on high error rates')
  it('should track topic health')
  it('should report consumer lag')
  it('should recover from consumer crashes')
})
```

---

### Week 3: Testing, Validation & Readiness

**Goal**: Full end-to-end validation, performance testing, production readiness

**Tasks**:

1. **Day 1-2: End-to-End Integration Tests**
   - [ ] Test complete job lifecycle: submit → queued → running → completed
   - [ ] Test failure path: submit → queued → failed
   - [ ] Test cancellation: submit → queued → cancelled
   - [ ] Test with 10+ concurrent jobs
   - [ ] Validate event ordering per job_id
   - [ ] Validate correlation IDs propagate correctly

2. **Day 3: Event Replay & Recovery Testing**
   - [ ] Consume from earliest offset
   - [ ] Test consumer group rebalancing
   - [ ] Test offset management
   - [ ] Simulate consumer crash → recovery
   - [ ] Validate no lost events
   - [ ] Test lag monitoring

3. **Day 4: Performance & Load Testing**
   - [ ] Publish 1000+ events as rapidly as possible
   - [ ] Measure end-to-end latency (publish → consume)
   - [ ] Measure consumer processing latency
   - [ ] Validate throughput > 100 events/sec
   - [ ] Monitor memory and CPU usage
   - [ ] Validate P99 latency < 150ms

4. **Day 5: Production Readiness**
   - [ ] Code review and approval
   - [ ] All tests passing (50+ tests)
   - [ ] Documentation complete
   - [ ] Error handling validated
   - [ ] Rollback procedures documented
   - [ ] Ready for deployment

**Tests Created** (15 tests):

```typescript
describe('Sprint 5.3 Integration & Validation', () => {
  // E2E Lifecycle (8)
  it('should execute complete job lifecycle')
  it('should handle job failure path')
  it('should handle job cancellation')
  it('should support 10+ concurrent jobs')
  it('should maintain event ordering')
  it('should propagate correlation IDs')
  it('should support partial retries')
  it('should recover from errors gracefully')

  // Event Replay & Recovery (4)
  it('should replay events from earliest offset')
  it('should handle consumer group rebalancing')
  it('should recover from consumer crash')
  it('should not lose events during recovery')

  // Performance (3)
  it('should handle 1000+ rapid events')
  it('should achieve < 150ms P99 latency')
  it('should maintain throughput > 100 events/sec')
})
```

---

## Dependencies & Prerequisites

### From Sprint 5.2 ✅ COMPLETE

- [x] KafkaService (260 lines) - 3-broker cluster support
- [x] Topic definitions (80 lines) - All 5 topics defined
- [x] Avro schemas - job-lifecycle, job-metrics, notifications, audit-trail, system-health
- [x] Test builders (820 lines) - KafkaEventBuilder, MockKafkaPublisher, LatencyMeasurer
- [x] 48 Kafka tests - Producer, consumer, performance, schema validation
- [x] Environment configuration - Docker Compose, topic setup

### To Be Completed in Sprint 5.3

- [ ] JobOrchestratorService Kafka integration
- [ ] MetricsService event consumer
- [ ] NotificationService event consumer
- [ ] ComplianceAuditor event consumer
- [ ] SystemHealthService event consumer
- [ ] 50+ integration & validation tests
- [ ] End-to-end test suite
- [ ] Performance benchmarking
- [ ] Production readiness checklist

---

## Test Matrix (50+ Tests)

### Publishing Tests (15)

| Test Name | Category | Status |
|-----------|----------|--------|
| Publish job.submitted event | Publishing | 📝 |
| Publish job.queued event | Publishing | 📝 |
| Publish job.running event | Publishing | 📝 |
| Publish job.completed event | Publishing | 📝 |
| Publish job.failed event | Publishing | 📝 |
| Publish job.cancelled event | Publishing | 📝 |
| Include correlation_id in headers | Publishing | 📝 |
| Include user_id in payload | Publishing | 📝 |
| Batch metrics updates | Publishing | 📝 |
| Preserve partition ordering | Publishing | 📝 |
| Handle publish failures | Publishing | 📝 |
| Retry failed publishes | Publishing | 📝 |
| Track publish latency | Publishing | 📝 |
| Validate event schema | Publishing | 📝 |
| Support event versioning | Publishing | 📝 |

### Consumer Tests (20)

| Test Name | Category | Status |
|-----------|----------|--------|
| Consume job.submitted event | Consumer | 📝 |
| Consume job.completed event | Consumer | 📝 |
| Consume job.failed event | Consumer | 📝 |
| Filter terminal events | Consumer | 📝 |
| Aggregate metrics by job | Consumer | 📝 |
| Broadcast WebSocket updates | Consumer | 📝 |
| Store audit trail | Consumer | 📝 |
| Query audit events | Consumer | 📝 |
| Handle decode errors | Consumer | 📝 |
| Track consumer lag | Consumer | 📝 |
| Rebalance on node failure | Consumer | 📝 |
| Resume from offset | Consumer | 📝 |
| Support early termination | Consumer | 📝 |
| Handle backpressure | Consumer | 📝 |
| Commit offsets correctly | Consumer | 📝 |
| Auto-recover from crash | Consumer | 📝 |
| Multiple consumer groups | Consumer | 📝 |
| Replay events from beginning | Consumer | 📝 |
| Handle duplicate messages | Consumer | 📝 |
| Monitor error rates | Consumer | 📝 |

### E2E Integration Tests (10)

| Test Name | Category | Status |
|-----------|----------|--------|
| Complete job lifecycle | E2E | 📝 |
| Job failure path | E2E | 📝 |
| Job cancellation path | E2E | 📝 |
| 10 concurrent jobs | E2E | 📝 |
| Event ordering per job | E2E | 📝 |
| Correlation ID propagation | E2E | 📝 |
| Partial failure recovery | E2E | 📝 |
| Service communication | E2E | 📝 |
| Consumer group coordination | E2E | 📝 |
| Cross-service triggering | E2E | 📝 |

### Performance Tests (5)

| Test Name | Category | Status |
|-----------|----------|--------|
| 1000+ rapid event publish | Performance | 📝 |
| P99 latency < 150ms | Performance | 📝 |
| Throughput > 100 events/sec | Performance | 📝 |
| Memory stability under load | Performance | 📝 |
| CPU usage within bounds | Performance | 📝 |

---

## Success Criteria

### Code Quality

- [x] Duration: 3 weeks (Feb 15 - March 7)
- [ ] All 50+ tests passing (100%)
- [ ] TypeScript: 0 compilation errors
- [ ] Code coverage: > 90% on all modified files
- [ ] Linting: Zero ESLint warnings

### Functionality

- [ ] Job submission publishes to Kafka
- [ ] Job status changes reflected in real-time
- [ ] Metrics aggregated and stored
- [ ] Notifications sent on terminal events
- [ ] Audit trail complete and queryable
- [ ] 100% job lifecycle event coverage

### Performance

- [ ] Publish latency: < 50ms (P99)
- [ ] Consumer processing: < 100ms (P99)
- [ ] Throughput: > 100 events/sec
- [ ] End-to-end latency: < 150ms (P99)
- [ ] Memory stable under load (no leaks)

### Reliability

- [ ] Event ordering guaranteed per job_id
- [ ] No lost events on failures
- [ ] Consumer auto-recovery working
- [ ] Rebalancing without data loss
- [ ] Offset management correct

### Documentation

- [ ] Integration guide complete
- [ ] API documentation updated
- [ ] Monitoring guide created
- [ ] Runbook for operations
- [ ] Deployment procedures

---

## Risk Mitigation

### Known Risks

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Import path issues | Pre-validate all imports before coding | Dev |
| Type incompatibilities | Use strict TypeScript mode throughout | Lead |
| Performance regression | Establish baselines before changes | QA |
| Message loss on failure | Deep test failure scenarios | QA |
| Consumer lag | Implement lag monitoring from Day 1 | Ops |
| Offset management bugs | Comprehensive offset tests | Dev |

### Contingency Planning

1. **If tests fail first attempt**:
   - Reserve 1-2 extra days for debugging
   - Focus on highest-risk areas first
   - Pair programming if stuck > 2 hours

2. **If performance targets missed**:
   - Profile hotspots immediately
   - Consider batch size optimization
   - Evaluate partition count impact

3. **If integration blocked**:
   - Fall back to mock Kafka for testing
   - Continue with component-level tests
   - Parallel track real integration

---

## Deliverables Checklist

### End of Week 1

- [ ] JobOrchestratorService publishes all job events
- [ ] 15 publishing tests passing
- [ ] Event ordering validated per job_id
- [ ] Correlation ID propagation verified
- [ ] Zero TypeScript errors

### End of Week 2

- [ ] MetricsService consumer operational
- [ ] NotificationService consumer operational
- [ ] ComplianceAuditor operational
- [ ] SystemHealthService operational
- [ ] 20 consumer tests passing
- [ ] Lag monitoring implemented

### End of Week 3

- [ ] All 50+ tests passing (100%)
- [ ] E2E job lifecycle validated
- [ ] Performance targets achieved
- [ ] Event replay verified
- [ ] Production readiness checklist completed
- [ ] Documentation complete

---

## File Structure (Planned)

```text
✅ apps/cosmic-horizons-api/src/app/
   ├── jobs/
   │   └── services/
   │       └── job-orchestrator.service.ts  (MODIFIED - add Kafka publishing)
   │
   ├── modules/events/
   │   ├── kafka.service.ts                 (COMPLETE from Sprint 5.2)
   │   ├── kafka/
   │   │   └── topics.ts                    (COMPLETE from Sprint 5.2)
   │   │
   │   ├── services/
   │   │   ├── metrics.service.ts           (NEW - Kafka consumer)
   │   │   ├── notification.service.ts      (MODIFIED - add Kafka consumer)
   │   │   ├── audit.service.ts             (NEW - ComplianceAuditor)
   │   │   └── health.service.ts            (NEW - SystemHealthService)
   │   │
   │   └── test/
   │       ├── kafka-test-builders.ts       (COMPLETE from Sprint 5.2)
   │       ├── kafka.service.spec.ts        (COMPLETE from Sprint 5.2)
   │       ├── job-events.spec.ts           (NEW - 15 publishing tests)
   │       ├── consumer-integration.spec.ts (NEW - 20 consumer tests)
   │       ├── e2e-job-lifecycle.spec.ts    (NEW - 10 E2E tests)
   │       └── performance.spec.ts          (NEW - 5 performance tests)
```

---

## Communication & Tracking

### Daily Standup (10 AM)

- What was completed yesterday?
- What is today's focus?
- Any blockers or risks?

### Weekly Review (Friday 4 PM)

- Demo completed features
- Review metrics and performance
- Plan next week

### Status Updates

- Document in [SPRINT-5-3-PROGRESS.md](SPRINT-5-3-PROGRESS.md)
- Update TODO.md daily
- Track test results in test-output/

---

## Next Immediate Actions

**Monday, Feb 15**:

1. [ ] Review Sprint 5.2 delivery one more time
2. [ ] Set up test file structure for Week 1 tests
3. [ ] Begin JobOrchestratorService integration
4. [ ] Create first job.submitted event publishing test

**By Wednesday, Feb 17**:

1. [ ] All job event publishing implemented
2. [ ] First 15 publishing tests passing
3. [ ] Partition ordering validated
4. [ ] Ready for consumer integration

**By Friday, Feb 20**:

1. [ ] Week 1 complete
2. [ ] All 15 publishing tests passing
3. [ ] Event schema validation done
4. [ ] Ready to begin consumer integration

---

## References

- **Sprint 5.2 Complete**: [SPRINT-5-2-FINAL-DELIVERY.md](SPRINT-5-2-FINAL-DELIVERY.md)
- **Kafka Test Builders**: [kafka-test-builders.ts](apps/cosmic-horizons-api/src/app/modules/events/test/kafka-test-builders.ts)
- **Event Models**: [@cosmic-horizons/event-models](libs/shared/event-models/src/index.ts)
- **Architecture**: [ADR-EVENT-STREAMING.md](ADR-EVENT-STREAMING.md)
- **Environment Config**: [SPRINT-5-2-ENVIRONMENT-CONFIG.md](SPRINT-5-2-ENVIRONMENT-CONFIG.md)

---

## Approval & Sign-Off

**Sprint Lead**: Cosmic Horizons Team  
**Status**: 🟢 READY TO KICKOFF  
**Target Completion**: March 7, 2026  
**Confidence**: High (Sprint 5.2 foundation ✅ complete)

**Next**: Begin Week 1 implementation immediately upon approval.
