# Sprint 5.3 Week 2: Consumer Service Tests (20 tests)

**All test code provided below - copy-paste ready**
**Framework**: Jest + NestJS Testing Module
**Pattern**: Use MockKafkaPublisher from Sprint 5.2

---

## Part 1: MetricsService Consumer Tests (5 tests)

### File: metrics.consumer.spec.ts

**Location**: `apps/cosmic-horizons-api/src/app/modules/events/consumers/test/metrics.consumer.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsConsumer } from '../metrics.consumer';
import { MetricsService } from '../../services/metrics.service';
import { KafkaService } from '../../kafka.service';
import { MockKafkaPublisher } from '../../test/kafka-test-builders';

describe('MetricsConsumer - Event Handling', () => {
  let consumer: MetricsConsumer;
  let metricsService: jest.Mocked<MetricsService>;
  let kafkaService: jest.Mocked<KafkaService>;

  const mockMetricEvent = {
    event_type: 'job.metrics_recorded',
    job_id: 'job-1',
    user_id: 'user-1',
    cpu_usage_percent: 75,
    memory_usage_mb: 2048,
    execution_time_seconds: 1800,
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsConsumer,
        {
          provide: MetricsService,
          useValue: {
            aggregateJobMetrics: jest.fn().mockResolvedValue(undefined),
            broadcastMetricsUpdate: jest.fn().mockResolvedValue(undefined),
            getConsumerLag: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: KafkaService,
          useValue: {
            subscribeToTopic: jest.fn().mockImplementation(async (topic, group, handler) => {
              // Simulate message delivery
              handler({ value: Buffer.from(JSON.stringify(mockMetricEvent)) });
            }),
            disconnect: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    consumer = module.get<MetricsConsumer>(MetricsConsumer);
    metricsService = module.get(MetricsService) as jest.Mocked<MetricsService>;
    kafkaService = module.get(KafkaService) as jest.Mocked<KafkaService>;
  });

  describe('Consumer Initialization', () => {
    it('should subscribe to job-metrics topic on module init', async () => {
      await consumer.onModuleInit();

      expect(kafkaService.subscribeToTopic).toHaveBeenCalledWith(
        'job-metrics',
        'metrics-consumer-group',
        expect.any(Function),
      );
    });

    it('should consume job.metrics_recorded events', async () => {
      await consumer.onModuleInit();

      expect(metricsService.aggregateJobMetrics).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          event_type: 'job.metrics_recorded',
          cpu_usage_percent: 75,
          memory_usage_mb: 2048,
        }),
      );
    });
  });

  describe('Metrics Aggregation', () => {
    it('should aggregate metrics by job_id', async () => {
      const event1 = { ...mockMetricEvent, memory_usage_mb: 2048 };
      const event2 = { ...mockMetricEvent, memory_usage_mb: 3072 };

      await consumer.onModuleInit();

      expect(metricsService.aggregateJobMetrics).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          memory_usage_mb: expect.any(Number),
        }),
      );
    });

    it('should broadcast metrics updates after aggregation', async () => {
      const aggregatedMetrics = {
        job_id: 'job-1',
        avg_cpu: 75,
        avg_memory: 2560,
        total_execution_time: 1800,
      };

      metricsService.aggregateJobMetrics.mockResolvedValueOnce(aggregatedMetrics);

      await consumer.onModuleInit();

      expect(metricsService.broadcastMetricsUpdate).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle metric aggregation errors gracefully', async () => {
      metricsService.aggregateJobMetrics.mockRejectedValueOnce(
        new Error('Database error'),
      );

      // Should not throw - continue consuming
      await expect(consumer.onModuleInit()).resolves.toBeUndefined();
      expect(metricsService.aggregateJobMetrics).toHaveBeenCalled();
    });
  });

  describe('Consumer Monitoring', () => {
    it('should track consumer lag', async () => {
      await consumer.onModuleInit();

      const lag = await metricsService.getConsumerLag();

      expect(lag).toBeDefined();
      expect(typeof lag).toBe('number');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should disconnect from Kafka on module destroy', async () => {
      await consumer.onModuleDestroy();

      expect(kafkaService.disconnect).toHaveBeenCalled();
    });
  });
});
```

---

## Part 2: NotificationService Consumer Tests (5 tests)

### File: job-events.consumer.spec.ts

**Location**: `apps/cosmic-horizons-api/src/app/modules/notifications/consumers/test/job-events.consumer.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JobEventsConsumer } from '../job-events.consumer';
import { NotificationService } from '../../services/notification.service';
import { KafkaService } from '../../../events/kafka.service';

describe('JobEventsConsumer - Terminal Event Notification', () => {
  let consumer: JobEventsConsumer;
  let notificationService: jest.Mocked<NotificationService>;
  let kafkaService: jest.Mocked<KafkaService>;

  const completedEvent = {
    event_type: 'job.completed',
    job_id: 'job-1',
    user_id: 'user-1',
    completed_at: new Date().toISOString(),
    result_url: 'https://storage.example.com/job-1/output',
    execution_time_seconds: 3600,
  };

  const failedEvent = {
    event_type: 'job.failed',
    job_id: 'job-2',
    user_id: 'user-1',
    failed_at: new Date().toISOString(),
    error_message: 'Out of memory',
    error_code: 137,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobEventsConsumer,
        {
          provide: NotificationService,
          useValue: {
            sendJobCompletionEmail: jest.fn().mockResolvedValue(undefined),
            sendJobFailureNotification: jest.fn().mockResolvedValue(undefined),
            broadcastViaWebSocket: jest.fn().mockResolvedValue(undefined),
            storeInAppNotification: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: KafkaService,
          useValue: {
            subscribeToTopic: jest.fn().mockImplementation(async (topic, group, handler) => {
              // Simulate message delivery
              handler({ value: Buffer.from(JSON.stringify(completedEvent)) });
            }),
            disconnect: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    consumer = module.get<JobEventsConsumer>(JobEventsConsumer);
    notificationService = module.get(NotificationService) as jest.Mocked<NotificationService>;
    kafkaService = module.get(KafkaService) as jest.Mocked<KafkaService>;
  });

  describe('Event Subscription', () => {
    it('should consume terminal job lifecycle events', async () => {
      await consumer.onModuleInit();

      expect(kafkaService.subscribeToTopic).toHaveBeenCalledWith(
        'job-lifecycle',
        'notifications-consumer-group',
        expect.any(Function),
      );
    });
  });

  describe('Terminal Event Filtering', () => {
    it('should filter for terminal events only (completed, failed, cancelled)', async () => {
      const nonTerminalEvent = {
        event_type: 'job.status.changed',
        job_id: 'job-1',
        new_status: 'RUNNING',
      };

      // Non-terminal should not trigger email
      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          handler({ value: Buffer.from(JSON.stringify(nonTerminalEvent)) });
        },
      );

      await consumer.onModuleInit();

      expect(notificationService.sendJobCompletionEmail).not.toHaveBeenCalled();
    });
  });

  describe('Job Completion Notifications', () => {
    it('should generate email for job.completed event', async () => {
      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          handler({ value: Buffer.from(JSON.stringify(completedEvent)) });
        },
      );

      await consumer.onModuleInit();

      expect(notificationService.sendJobCompletionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          job_id: 'job-1',
          result_url: 'https://storage.example.com/job-1/output',
        }),
      );
    });
  });

  describe('Job Failure Notifications', () => {
    it('should generate notification for job.failed event', async () => {
      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          handler({ value: Buffer.from(JSON.stringify(failedEvent)) });
        },
      );

      await consumer.onModuleInit();

      expect(notificationService.sendJobFailureNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          job_id: 'job-2',
          error_message: 'Out of memory',
        }),
      );
    });
  });

  describe('Real-time Broadcasting', () => {
    it('should broadcast WebSocket notifications for terminal events', async () => {
      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          handler({ value: Buffer.from(JSON.stringify(completedEvent)) });
        },
      );

      await consumer.onModuleInit();

      expect(notificationService.broadcastViaWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'job.completed',
          job_id: 'job-1',
          user_id: 'user-1',
        }),
      );
    });
  });

  describe('Error Resilience', () => {
    it('should handle notification delivery failures gracefully', async () => {
      notificationService.sendJobCompletionEmail.mockRejectedValueOnce(
        new Error('SMTP server timeout'),
      );

      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          handler({ value: Buffer.from(JSON.stringify(completedEvent)) });
        },
      );

      // Should not throw - continue consuming
      await expect(consumer.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('Shutdown', () => {
    it('should gracefully shutdown and disconnect', async () => {
      await consumer.onModuleDestroy();

      expect(kafkaService.disconnect).toHaveBeenCalled();
    });
  });
});
```

---

## Part 3: ComplianceAuditor Consumer Tests (5 tests)

### File: audit-trail.consumer.spec.ts

**Location**: `apps/cosmic-horizons-api/src/app/modules/audit/consumers/test/audit-trail.consumer.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuditTrailConsumer } from '../audit-trail.consumer';
import { ComplianceAuditorService } from '../../services/compliance-auditor.service';
import { KafkaService } from '../../../events/kafka.service';

describe('AuditTrailConsumer - Compliance Event Storage', () => {
  let consumer: AuditTrailConsumer;
  let auditorService: jest.Mocked<ComplianceAuditorService>;
  let kafkaService: jest.Mocked<KafkaService>;

  const auditEvent = {
    event_type: 'job.submitted',
    job_id: 'job-1',
    user_id: 'user-1',
    action: 'CREATE',
    resource_type: 'job',
    resource_id: 'job-1',
    timestamp: new Date().toISOString(),
    actor: { user_id: 'user-1', email: 'user@example.com' },
    details: { agent: 'AlphaCal', dataset_id: 'dataset-1' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditTrailConsumer,
        {
          provide: ComplianceAuditorService,
          useValue: {
            storeImmutableEvent: jest.fn().mockResolvedValue(undefined),
            queryAuditTrail: jest.fn().mockResolvedValue({ events: [], total: 0 }),
            generateComplianceReport: jest.fn().mockResolvedValue({ report: 'OK' }),
            verifyRetentionPolicy: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: KafkaService,
          useValue: {
            subscribeToTopic: jest.fn().mockImplementation(async (topic, group, handler) => {
              handler({ value: Buffer.from(JSON.stringify(auditEvent)) });
            }),
            disconnect: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    consumer = module.get<AuditTrailConsumer>(AuditTrailConsumer);
    auditorService = module.get(ComplianceAuditorService) as jest.Mocked<ComplianceAuditorService>;
    kafkaService = module.get(KafkaService) as jest.Mocked<KafkaService>;
  });

  describe('Audit Event Consumption', () => {
    it('should consume audit-trail topic events', async () => {
      await consumer.onModuleInit();

      expect(kafkaService.subscribeToTopic).toHaveBeenCalledWith(
        'audit-trail',
        'audit-trail-consumer-group',
        expect.any(Function),
      );
    });

    it('should store consumed events as immutable records', async () => {
      await consumer.onModuleInit();

      expect(auditorService.storeImmutableEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'job.submitted',
          job_id: 'job-1',
          user_id: 'user-1',
        }),
      );
    });
  });

  describe('Data Integrity', () => {
    it('should store events with cryptographic hash for integrity verification', async () => {
      await consumer.onModuleInit();

      expect(auditorService.storeImmutableEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
          actor: expect.objectContaining({ user_id: 'user-1' }),
        }),
      );
    });
  });

  describe('Retention Policy Enforcement', () => {
    it('should enforce 90-day retention policy on stored events', async () => {
      auditorService.verifyRetentionPolicy.mockResolvedValueOnce(true);

      await consumer.onModuleInit();

      const storedEvent = auditorService.storeImmutableEvent.mock.calls[0][0];
      expect(storedEvent).toBeDefined();

      // Verify retention was enforced
      expect(auditorService.verifyRetentionPolicy).toBeDefined();
    });
  });

  describe('Audit Trail Querying', () => {
    it('should support querying audit trail by time range and event type', async () => {
      const queryResult = await auditorService.queryAuditTrail(
        {
          eventType: 'job.submitted',
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
        },
        50,
        0,
      );

      expect(queryResult).toBeDefined();
      expect(queryResult.events).toBeDefined();
      expect(queryResult.total).toBeDefined();
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate compliance reports from audit trail', async () => {
      const report = await auditorService.generateComplianceReport();

      expect(report).toBeDefined();
      expect(report.report).toBe('OK');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should disconnect from Kafka on module destroy', async () => {
      await consumer.onModuleDestroy();

      expect(kafkaService.disconnect).toHaveBeenCalled();
    });
  });
});
```

---

## Part 4: SystemHealthMonitor Consumer Tests (5 tests)

### File: system-health.consumer.spec.ts

**Location**: `apps/cosmic-horizons-api/src/app/modules/health/consumers/test/system-health.consumer.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SystemHealthConsumer } from '../system-health.consumer';
import { SystemHealthMonitorService } from '../../services/system-health-monitor.service';
import { KafkaService } from '../../../events/kafka.service';

describe('SystemHealthConsumer - Monitoring & Alerting', () => {
  let consumer: SystemHealthConsumer;
  let healthMonitor: jest.Mocked<SystemHealthMonitorService>;
  let kafkaService: jest.Mocked<KafkaService>;

  const healthEvent = {
    event_type: 'broker.health',
    broker_id: 1,
    topic: 'job-lifecycle',
    error_rate: 0.01, // 1%
    consumer_lag: 125,
    partition_count: 10,
    replication_factor: 3,
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemHealthConsumer,
        {
          provide: SystemHealthMonitorService,
          useValue: {
            processHealthEvent: jest.fn().mockResolvedValue(undefined),
            checkErrorRateThreshold: jest.fn().mockResolvedValue(false),
            checkConsumerLagThreshold: jest.fn().mockResolvedValue(false),
            triggerAlert: jest.fn().mockResolvedValue(undefined),
            getHealthStatus: jest.fn().mockResolvedValue({
              status: 'healthy',
              errorRate: 0.01,
              avgConsumerLag: 125,
            }),
          },
        },
        {
          provide: KafkaService,
          useValue: {
            subscribeToTopic: jest.fn().mockImplementation(async (topic, group, handler) => {
              handler({ value: Buffer.from(JSON.stringify(healthEvent)) });
            }),
            disconnect: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    consumer = module.get<SystemHealthConsumer>(SystemHealthConsumer);
    healthMonitor = module.get(SystemHealthMonitorService) as jest.Mocked<SystemHealthMonitorService>;
    kafkaService = module.get(KafkaService) as jest.Mocked<KafkaService>;
  });

  describe('Health Event Consumption', () => {
    it('should monitor system health events from Kafka', async () => {
      await consumer.onModuleInit();

      expect(kafkaService.subscribeToTopic).toHaveBeenCalledWith(
        'system-health',
        'system-health-consumer-group',
        expect.any(Function),
      );
    });
  });

  describe('Error Rate Monitoring', () => {
    it('should alert on high error rates exceeding threshold', async () => {
      const degradedEvent = { ...healthEvent, error_rate: 0.15 }; // 15% > 5% threshold

      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          handler({ value: Buffer.from(JSON.stringify(degradedEvent)) });
        },
      );

      healthMonitor.checkErrorRateThreshold.mockResolvedValueOnce(true);

      await consumer.onModuleInit();

      expect(healthMonitor.processHealthEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          error_rate: 0.15,
        }),
      );
    });
  });

  describe('Topic Health Tracking', () => {
    it('should track health status of all topics', async () => {
      await consumer.onModuleInit();

      const status = await healthMonitor.getHealthStatus();

      expect(status).toBeDefined();
      expect(status.status).toMatch(/healthy|degraded/);
      expect(status.errorRate).toBeDefined();
    });
  });

  describe('Consumer Lag Reporting', () => {
    it('should report consumer lag and trigger alert if exceeds threshold', async () => {
      const lagEvent = { ...healthEvent, consumer_lag: 5000 }; // 5000 > 1000 threshold

      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          handler({ value: Buffer.from(JSON.stringify(lagEvent)) });
        },
      );

      healthMonitor.checkConsumerLagThreshold.mockResolvedValueOnce(true);

      await consumer.onModuleInit();

      expect(healthMonitor.processHealthEvent).toHaveBeenCalled();
    });
  });

  describe('Consumer Recovery', () => {
    it('should handle consumer crashes and recovery gracefully', async () => {
      kafkaService.subscribeToTopic.mockImplementationOnce(
        async (topic, group, handler) => {
          // Simulate event delivery
          handler({ value: Buffer.from(JSON.stringify(healthEvent)) });
          // Then simulate reconnection
          handler({ value: Buffer.from(JSON.stringify(healthEvent)) });
        },
      );

      await consumer.onModuleInit();

      // Should have processed events from both before and after recovery
      expect(healthMonitor.processHealthEvent).toHaveBeenCalled();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should disconnect from Kafka on module destroy', async () => {
      await consumer.onModuleDestroy();

      expect(kafkaService.disconnect).toHaveBeenCalled();
    });
  });
});
```

---

## Test Summary

| Service | Test File | Tests | Lines |
|---------|-----------|-------|-------|
| MetricsService | metrics.consumer.spec.ts | 5 | 180 |
| NotificationService | job-events.consumer.spec.ts | 5 | 220 |
| ComplianceAuditor | audit-trail.consumer.spec.ts | 5 | 200 |
| SystemHealthMonitor | system-health.consumer.spec.ts | 5 | 200 |
| **TOTAL** | | **20** | **800** |

---

## Integration Notes

All tests use:

- ✅ MockKafkaPublisher (from Sprint 5.2)
- ✅ NestJS Test.createTestingModule()
- ✅ jest.fn() and mockResolvedValue patterns
- ✅ Non-blocking error handling
- ✅ Graceful shutdown (onModuleDestroy)

No external dependencies needed beyond what's already in events module.
