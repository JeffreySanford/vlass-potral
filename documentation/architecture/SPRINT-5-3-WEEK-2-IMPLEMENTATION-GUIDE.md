# Sprint 5.3 Week 2: Consumer Integration & Event Handling

**Focus**: Build 4 consumer services to handle Kafka events (20 tests)
**Timeline**: Feb 24 - Mar 1, 2026 (5 business days)
**Deliverable**: MetricsService, NotificationService, ComplianceAuditor, SystemHealthMonitor + 20 tests

---

## Architecture Overview

### Consumer Group Strategy

- **metrics-consumer-group**: Subscribes to `job-metrics` topic (10 partitions)
- **notifications-consumer-group**: Subscribes to `job-lifecycle` topic (10 partitions)
- **audit-trail-consumer-group**: Subscribes to `audit-trail` topic (5 partitions)
- **system-health-consumer-group**: Subscribes to `system-health` topic (3 partitions)

### Event Processing Patterns

```typescript
// Non-blocking consumption (async/await)
// Offset management (auto-commit or manual)
// Error recovery with exponential backoff
// Consumer lag monitoring
// Graceful shutdown on app termination
```

---

## Day 1-2: MetricsService Consumer (5 tests)

### Files to Modify/Create

```text
apps/cosmic-horizons-api/src/app/modules/events/
├── consumers/
│   └── metrics.consumer.ts (NEW)
├── services/
│   └── metrics.service.ts (MODIFY - add metrics aggregation)
└── test/
    └── metrics.consumer.spec.ts (NEW - 5 tests)
```

### Implementation Steps

#### Step 1: Create MetricsConsumer (metrics.consumer.ts)

```typescript
// Location: apps/cosmic-horizons-api/src/app/modules/events/consumers/metrics.consumer.ts

@Injectable()
export class MetricsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MetricsConsumer');

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafkaService.disconnect();
  }

  private async startConsuming(): Promise<void> {
    await this.kafkaService.subscribeToTopic(
      'job-metrics',
      'metrics-consumer-group',
      async (message: any) => {
        try {
          const event = JSON.parse(message.value.toString());
          await this.handleMetricEvent(event);
        } catch (error) {
          this.logger.error(`Failed to process metrics event: ${error}`);
          // Non-blocking - continue consuming
        }
      },
    );
  }

  private async handleMetricEvent(event: any): Promise<void> {
    // Aggregate metrics from event
    // Store in metrics database
    // Broadcast updates
    // Track consumer lag
  }
}
```

#### Step 2: Add Metrics Aggregation Methods (metrics.service.ts)

```typescript
// Add to metrics service:
- aggregateJobMetrics(jobId: string, metrics: MetricPayload)
- getJobMetricsSummary(jobId: string)
- broadcastMetricsUpdate(jobId: string, metrics)
- getConsumerLag()
```

#### Step 3: Add MetricsConsumer to EventsModule

```typescript
// In events.module.ts, add MetricsConsumer to providers
providers: [
  KafkaService,
  EventsService,
  MetricsService,
  MetricsConsumer,  // ← ADD
]
```

#### Step 4: Create Tests (metrics.consumer.spec.ts)

- Test 1: Should consume job.metrics_recorded events
- Test 2: Should aggregate metrics by job_id
- Test 3: Should broadcast metrics updates
- Test 4: Should handle metric aggregation errors
- Test 5: Should track consumer lag

**Estimated Lines**: 60 (consumer) + 30 (service) + 250 (tests) = 340 lines

---

## Day 3: NotificationService Consumer (5 tests)

### Files to Modify/Create

```text
apps/cosmic-horizons-api/src/app/modules/notifications/
├── consumers/
│   └── job-events.consumer.ts (NEW)
├── services/
│   └── notification.service.ts (MODIFY - add event handling)
└── test/
    └── job-events.consumer.spec.ts (NEW - 5 tests)
```

### Implementation Steps

#### Step 1: Create JobEventsConsumer (job-events.consumer.ts)

```typescript
@Injectable()
export class JobEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('JobEventsConsumer');

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafkaService.disconnect();
  }

  private async startConsuming(): Promise<void> {
    await this.kafkaService.subscribeToTopic(
      'job-lifecycle',
      'notifications-consumer-group',
      async (message: any) => {
        try {
          const event = JSON.parse(message.value.toString());
          if (this.isTerminalEvent(event)) {
            await this.handleTerminalEvent(event);
          }
        } catch (error) {
          this.logger.error(`Failed to process lifecycle event: ${error}`);
        }
      },
    );
  }

  private isTerminalEvent(event: any): boolean {
    return ['job.completed', 'job.failed', 'job.cancelled'].includes(event.event_type);
  }

  private async handleTerminalEvent(event: any): Promise<void> {
    // Generate notifications based on event type
    // Store in-app notifications
    // Broadcast via WebSocket
  }
}
```

#### Step 2: Add Notification Publishing Methods (notification.service.ts)

```typescript
// Add to notification service:
- sendJobCompletionNotification(jobId: string, userId: string, event: any)
- sendJobFailureNotification(jobId: string, userId: string, event: any)
- broadcastViaWebSocket(notification: Notification)
```

#### Step 3: Add JobEventsConsumer to NotificationsModule

```typescript
providers: [
  NotificationService,
  JobEventsConsumer,  // ← ADD
]
```

#### Step 4: Create Tests (job-events.consumer.spec.ts)

- Test 1: Should consume terminal job events
- Test 2: Should generate email for job.completed
- Test 3: Should generate notification for job.failed
- Test 4: Should broadcast WebSocket messages
- Test 5: Should handle notification delivery failures

**Estimated Lines**: 60 (consumer) + 40 (service) + 280 (tests) = 380 lines

---

## Day 4: ComplianceAuditor Consumer (5 tests)

### Files to Modify/Create

```text
apps/cosmic-horizons-api/src/app/modules/audit/
├── consumers/
│   └── audit-trail.consumer.ts (NEW)
├── services/
│   └── compliance-auditor.service.ts (NEW)
└── test/
    └── audit-trail.consumer.spec.ts (NEW - 5 tests)
```

### Implementation Steps

#### Step 1: Create AuditTrailConsumer (audit-trail.consumer.ts)

```typescript
@Injectable()
export class AuditTrailConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AuditTrailConsumer');

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly complianceAuditor: ComplianceAuditorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafkaService.disconnect();
  }

  private async startConsuming(): Promise<void> {
    await this.kafkaService.subscribeToTopic(
      'audit-trail',
      'audit-trail-consumer-group',
      async (message: any) => {
        try {
          const event = JSON.parse(message.value.toString());
          await this.complianceAuditor.storeImmutableEvent(event);
        } catch (error) {
          this.logger.error(`Failed to store audit event: ${error}`);
          // Don't skip - audit trail must capture everything
        }
      },
    );
  }
}
```

#### Step 2: Create ComplianceAuditorService (compliance-auditor.service.ts)

```typescript
@Injectable()
export class ComplianceAuditorService {
  constructor(
    private readonly auditRepository: AuditEventRepository,
  ) {}

  async storeImmutableEvent(event: any): Promise<void> {
    // Store with immutable flag, timestamp, hash
    // Validate 90-day retention policy
    // Log storage success
  }

  async queryAuditTrail(filters: any, limit: number, offset: number) {
    // Query immutable audit events
    // Apply time-based filtering
    // Return paginated results
  }

  async generateComplianceReport() {
    // Collect all audit events in reporting period
    // Generate summary report with event counts
    // Return with attestation timestamp
  }
}
```

#### Step 3: Create Tests (audit-trail.consumer.spec.ts)

- Test 1: Should consume audit-trail events
- Test 2: Should store events immutably
- Test 3: Should enforce 90-day retention
- Test 4: Should support audit trail queries
- Test 5: Should generate compliance reports

**Estimated Lines**: 50 (consumer) + 100 (service) + 300 (tests) = 450 lines

---

## Day 5: SystemHealthMonitor Consumer (5 tests)

### Files to Modify/Create

```text
apps/cosmic-horizons-api/src/app/modules/health/
├── consumers/
│   └── system-health.consumer.ts (NEW)
├── services/
│   └── system-health-monitor.service.ts (NEW)
└── test/
    └── system-health.consumer.spec.ts (NEW - 5 tests)
```

### Implementation Steps

#### Step 1: Create SystemHealthConsumer (system-health.consumer.ts)

```typescript
@Injectable()
export class SystemHealthConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SystemHealthConsumer');

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly healthMonitor: SystemHealthMonitorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafkaService.disconnect();
  }

  private async startConsuming(): Promise<void> {
    await this.kafkaService.subscribeToTopic(
      'system-health',
      'system-health-consumer-group',
      async (message: any) => {
        try {
          const event = JSON.parse(message.value.toString());
          await this.healthMonitor.processHealthEvent(event);
        } catch (error) {
          this.logger.error(`Failed to process health event: ${error}`);
        }
      },
    );
  }
}
```

#### Step 2: Create SystemHealthMonitorService (system-health-monitor.service.ts)

```typescript
@Injectable()
export class SystemHealthMonitorService {
  constructor() {}

  async processHealthEvent(event: any): Promise<void> {
    // Parse health metrics from event
    // Check error rate thresholds
    // Check consumer lag thresholds
    // Trigger alerts if degradation detected
  }

  async getHealthStatus(): Promise<SystemHealth> {
    // Return current system health
    // Include error rates, lag, broker health
  }

  async triggerAlert(alert: HealthAlert): Promise<void> {
    // Send alert via configured channels
  }
}
```

#### Step 3: Create Tests (system-health.consumer.spec.ts)

- Test 1: Should monitor system health events
- Test 2: Should alert on high error rates
- Test 3: Should track topic health
- Test 4: Should report consumer lag
- Test 5: Should recover from consumer crashes

**Estimated Lines**: 50 (consumer) + 80 (service) + 280 (tests) = 410 lines

---

## Implementation Checklist

### Day 1-2 (MetricsService)

- [ ] Create metrics.consumer.ts (60 lines)
- [ ] Add aggregation methods to metrics.service.ts (30 lines)
- [ ] Register consumer in EventsModule
- [ ] Create metrics.consumer.spec.ts with 5 tests (250 lines)
- [ ] Verify all 5 MetricsService tests pass ✅
- [ ] Use MockKafkaPublisher pattern for testing

### Day 3 (NotificationService)

- [ ] Create job-events.consumer.ts (60 lines)
- [ ] Add notification methods to notification.service.ts (40 lines)
- [ ] Register consumer in NotificationsModule
- [ ] Create job-events.consumer.spec.ts with 5 tests (280 lines)
- [ ] Verify all 5 NotificationService tests pass ✅

### Day 4 (ComplianceAuditor)

- [ ] Create audit-trail.consumer.ts (50 lines)
- [ ] Create compliance-auditor.service.ts (100 lines)
- [ ] Create audit event repository (if needed)
- [ ] Register consumer in AuditModule
- [ ] Create audit-trail.consumer.spec.ts with 5 tests (300 lines)
- [ ] Verify all 5 ComplianceAuditor tests pass ✅

### Day 5 (SystemHealthMonitor)

- [ ] Create system-health.consumer.ts (50 lines)
- [ ] Create system-health-monitor.service.ts (80 lines)
- [ ] Register consumer in HealthModule
- [ ] Create system-health.consumer.spec.ts with 5 tests (280 lines)
- [ ] Verify all 5 SystemHealthMonitor tests pass ✅
- [ ] **Total week**: 40+ new service files + 1,100+ lines of tests + 380 lines of consumers

---

## Test Category Breakdown

| Consumer | Test Category | Count | Pattern |
|----------|---|-------|---------|
| MetricsService | Event consumption | 1 | Subscribe → receive |
| | Data aggregation | 1 | Group metrics by job_id |
| | Broadcasting | 1 | Publish updates |
| | Error handling | 1 | Continue on failure |
| | Monitoring | 1 | Track consumer lag |
| **NotificationService** | **Event filtering** | **1** | **Terminal events only** |
| | Email generation | 1 | job.completed → email |
| | In-app notifications | 1 | job.failed → notification |
| | WebSocket broadcast | 1 | Real-time updates |
| | Delivery resilience | 1 | Continue on send failure |
| **ComplianceAuditor** | **Event storage** | **1** | **Immutable append** |
| | Data integrity | 1 | Hash verification |
| | Retention policy | 1 | 90-day enforcement |
| | Query capability | 1 | Filter by date/type |
| | Reporting | 1 | Generate compliance summary |
| **SystemHealthMonitor** | **Health tracking** | **1** | **Parse metrics** |
| | Alert triggers | 1 | Error rate threshold |
| | Topic monitoring | 1 | All topics health |
| | Lag reporting | 1 | Consumer lag tracking |
| | Recovery handling | 1 | Restart simulation |
| **TOTAL** | | **20** | |

---

## Mock Infrastructure Provided (from Sprint 5.2)

All tests use existing infrastructure:

```typescript
// Available in test files:
import { MockKafkaPublisher, LatencyMeasurer, ConsumerMessageCapture } from 'kafka-test-builders';

// Example mock usage:
const mockKafka = new MockKafkaPublisher();
mockKafka.subscribeToTopic('job-metrics', 'metrics-consumer-group', handler);
await mockKafka.publish('job-metrics', { event_type: 'job.metrics_recorded', ... }, 'job-1');

// Assertions:
expect(mockKafka.getMessages('job-metrics')).toHaveLength(1);
expect(mockKafka.getLastMessage('job-metrics')).toMatchObject({ event_type: 'job.metrics_recorded' });
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Event processing latency | < 100ms |
| Consumer lag (per topic) | < 5 seconds |
| Message delivery success rate | > 99.9% |
| Error recovery time | < 30 seconds |

---

## Rollback Plan

If any consumer fails:

1. Stop consumer gracefully via `onModuleDestroy()`
2. Pause consuming from respective topic
3. Check Kafka offset (can replay from specific point)
4. Fix issue and restart consumer
5. Verify consumer lag is recovering

**No data loss** - all events remain in Kafka for 30+ days

---

## Team Coordination

**Daily Standup** (09:00 UTC):

- Report event processing lag
- Share blockers
- Confirm consumer group assignments

**End of Week 2 Readiness**:

- All 20 tests passing ✅
- Consumer groups created and consuming ✅
- Offset management verified ✅
- Ready for Week 3 integration tests ✅
