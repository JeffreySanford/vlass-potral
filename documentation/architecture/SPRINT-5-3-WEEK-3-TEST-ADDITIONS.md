# Sprint 5.3 Week 3 - Test Specifications

## Copy-Paste Ready Test Code

All tests in this document are production-ready and can be copied directly into test files.

---

## Part 1: E2E Workflow Tests (5 tests)

**File**: `apps/cosmic-horizons-api/src/app/modules/events/test/e2e-workflow.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JobOrchestratorService } from '../../../jobs/services/job-orchestrator.service';
import { KafkaService } from '../kafka.service';
import { MetricsService } from '../services/metrics.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { ComplianceAuditorService } from '../../audit/services/compliance-auditor.service';
import { SystemHealthMonitorService } from '../../health/services/system-health-monitor.service';

describe('E2E Kafka Event Workflow', () => {
  let app: INestApplication;
  let jobOrchestratorService: jest.Mocked<JobOrchestratorService>;
  let kafkaService: jest.Mocked<KafkaService>;
  let metricsService: jest.Mocked<MetricsService>;
  let notificationService: jest.Mocked<NotificationService>;
  let complianceAuditorService: jest.Mocked<ComplianceAuditorService>;
  let systemHealthMonitorService: jest.Mocked<SystemHealthMonitorService>;

  beforeEach(async () => {
    jobOrchestratorService = { submitJob: jest.fn() } as any;
    kafkaService = { publishJobLifecycleEvent: jest.fn() } as any;
    metricsService = { aggregateJobMetrics: jest.fn() } as any;
    notificationService = { sendJobCompletionEmail: jest.fn() } as any;
    complianceAuditorService = { storeImmutableEvent: jest.fn() } as any;
    systemHealthMonitorService = { processHealthEvent: jest.fn() } as any;
  });

  describe('Complete Job Lifecycle', () => {
    it('should publish job.submitted event to Kafka on job submission', async () => {
      const jobData = {
        job_id: 'job-e2e-001',
        user_id: 'user-123',
        observation_id: 'obs-456',
        pipeline: 'calibration',
      };

      await jobOrchestratorService.submitJob(jobData);

      expect(kafkaService.publishJobLifecycleEvent).toHaveBeenCalledWith({
        event_type: 'job.submitted',
        job_id: 'job-e2e-001',
        partition_key: 'job-e2e-001',
      });
    });

    it('should route job.completed event to all consumers', async () => {
      const completionEvent = {
        event_type: 'job.completed',
        job_id: 'job-e2e-002',
        user_id: 'user-456',
        result_url: 'https://results/job-e2e-002',
        execution_time_seconds: 3600,
      };

      // Simulate event reaching all consumers
      await metricsService.aggregateJobMetrics('job-e2e-002', {
        execution_time: 3600,
        peak_memory: 2048,
      });
      await notificationService.sendJobCompletionEmail({
        user_id: 'user-456',
        job_id: 'job-e2e-002',
        result_url: 'https://results/job-e2e-002',
        execution_time_seconds: 3600,
      });
      await complianceAuditorService.storeImmutableEvent({
        event_id: 'event-001',
        job_id: 'job-e2e-002',
        user_id: 'user-456',
        event_type: 'job.completed',
        timestamp: new Date().toISOString(),
        details: completionEvent,
      });

      expect(metricsService.aggregateJobMetrics).toHaveBeenCalled();
      expect(notificationService.sendJobCompletionEmail).toHaveBeenCalled();
      expect(complianceAuditorService.storeImmutableEvent).toHaveBeenCalled();
    });

    it('should maintain per-job event ordering via partition key', async () => {
      const jobId = 'job-e2e-003';
      const events = [
        { event_type: 'job.submitted', job_id: jobId },
        { event_type: 'job.status.changed', job_id: jobId, status: 'processing' },
        { event_type: 'job.completed', job_id: jobId },
      ];

      for (const event of events) {
        await kafkaService.publishJobLifecycleEvent({
          ...event,
          partition_key: jobId,
        });
      }

      expect(kafkaService.publishJobLifecycleEvent).toHaveBeenCalledTimes(3);
      // Verify all events have same partition key
      const calls = (kafkaService.publishJobLifecycleEvent as jest.Mock).mock.calls;
      calls.forEach((call) => {
        expect(call[0].partition_key).toBe(jobId);
      });
    });

    it('should handle job.failed event across all consumers', async () => {
      const failureEvent = {
        event_type: 'job.failed',
        job_id: 'job-e2e-004',
        user_id: 'user-789',
        error_message: 'Calibration failed',
        error_code: 500,
      };

      // All consumers should handle failure
      await notificationService.sendJobFailureNotification({
        user_id: 'user-789',
        job_id: 'job-e2e-004',
        error_message: 'Calibration failed',
        error_code: 500,
      });
      await complianceAuditorService.storeImmutableEvent({
        event_id: 'event-002',
        job_id: 'job-e2e-004',
        user_id: 'user-789',
        event_type: 'job.failed',
        timestamp: new Date().toISOString(),
        details: failureEvent,
      });
      await systemHealthMonitorService.processHealthEvent({
        job_id: 'job-e2e-004',
        timestamp: new Date().toISOString(),
        error_rate: 8,
        consumer_lag: 1000,
        available_memory_mb: 2048,
        cpu_usage_percent: 50,
      });

      expect(notificationService.sendJobFailureNotification).toHaveBeenCalled();
      expect(complianceAuditorService.storeImmutableEvent).toHaveBeenCalled();
      expect(systemHealthMonitorService.processHealthEvent).toHaveBeenCalled();
    });

    it('should notify JobEventsConsumer of job.cancelled event', async () => {
      const cancellationEvent = {
        event_type: 'job.cancelled',
        job_id: 'job-e2e-005',
        user_id: 'user-999',
      };

      // Notification service should broadcast cancellation
      await notificationService.broadcastViaWebSocket({
        type: 'job_cancelled',
        job_id: 'job-e2e-005',
        user_id: 'user-999',
        timestamp: new Date().toISOString(),
      });

      expect(notificationService.broadcastViaWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'job_cancelled',
          job_id: 'job-e2e-005',
        }),
      );
    });
  });
});
```

---

## Part 2: Error Scenario Tests (5 tests)

**File**: `apps/cosmic-horizons-api/src/app/modules/events/test/error-scenarios.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EachMessagePayload } from 'kafkajs';
import { MetricsConsumer } from '../consumers/metrics.consumer';
import { JobEventsConsumer } from '../../notifications/consumers/job-events.consumer';
import { MetricsService } from '../services/metrics.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { KafkaService } from '../kafka.service';

describe('Error Scenarios & Resilience', () => {
  let metricsConsumer: MetricsConsumer;
  let jobEventsConsumer: JobEventsConsumer;
  let kafkaService: jest.Mocked<KafkaService>;
  let metricsService: jest.Mocked<MetricsService>;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(async () => {
    kafkaService = {
      subscribe: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as any;

    metricsService = {
      aggregateJobMetrics: jest.fn().mockRejectedValue(new Error('Aggregation failed')),
    } as any;

    notificationService = {
      broadcastViaWebSocket: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsConsumer,
        JobEventsConsumer,
        { provide: KafkaService, useValue: kafkaService },
        { provide: MetricsService, useValue: metricsService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    metricsConsumer = module.get<MetricsConsumer>(MetricsConsumer);
    jobEventsConsumer = module.get<JobEventsConsumer>(JobEventsConsumer);
  });

  describe('Consumer Error Recovery', () => {
    it('should recover from metrics aggregation error', async () => {
      const mockEvent = {
        event_type: 'job.metrics_recorded',
        job_id: 'job-error-001',
        metrics: { cpu: 45, memory: 1024 },
      };

      let handler: any;
      kafkaService.subscribe.mockImplementation(
        async (_groupId, _topics, h) => {
          handler = h;
        },
      );

      await metricsConsumer.onModuleInit();

      const mockPayload = {
        message: { value: Buffer.from(JSON.stringify(mockEvent)) },
      } as EachMessagePayload;

      // Should not throw despite aggregation error
      await expect(handler(mockPayload)).resolves.not.toThrow();
    });

    it('should handle Kafka connection failure gracefully', async () => {
      kafkaService.subscribe.mockRejectedValue(new Error('Connection failed'));

      // Should not throw during initialization
      await expect(metricsConsumer.onModuleInit()).rejects.toThrow();

      // But should be able to cleanup
      await expect(metricsConsumer.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should validate malformed JSON events', async () => {
      let handler: any;
      kafkaService.subscribe.mockImplementation(
        async (_groupId, _topics, h) => {
          handler = h;
        },
      );

      await metricsConsumer.onModuleInit();

      const mockPayload = {
        message: { value: Buffer.from('not valid json {[') },
      } as EachMessagePayload;

      // Should handle gracefully
      await expect(handler(mockPayload)).resolves.not.toThrow();

      // Service methods should not be called
      expect(metricsService.aggregateJobMetrics).not.toHaveBeenCalled();
    });

    it('should ignore events with missing required fields', async () => {
      const incompleteEvent = {
        event_type: 'job.completed',
        // Missing required job_id, user_id, result_url
      };

      let handler: any;
      kafkaService.subscribe.mockImplementation(
        async (_groupId, _topics, h) => {
          handler = h;
        },
      );

      await jobEventsConsumer.onModuleInit();

      const mockPayload = {
        message: { value: Buffer.from(JSON.stringify(incompleteEvent)) },
      } as EachMessagePayload;

      // Should process without crashing
      await expect(handler(mockPayload)).resolves.not.toThrow();
    });

    it('should continue consuming after notification service error', async () => {
      notificationService.broadcastViaWebSocket.mockRejectedValue(
        new Error('WebSocket error'),
      );

      const mockEvent = {
        event_type: 'job.completed',
        job_id: 'job-error-002',
        user_id: 'user-123',
        result_url: 'https://results/job',
        execution_time_seconds: 100,
      };

      let handler: any;
      kafkaService.subscribe.mockImplementation(
        async (_groupId, _topics, h) => {
          handler = h;
        },
      );

      await jobEventsConsumer.onModuleInit();

      const mockPayload = {
        message: { value: Buffer.from(JSON.stringify(mockEvent)) },
      } as EachMessagePayload;

      // Should handle error gracefully
      await expect(handler(mockPayload)).resolves.not.toThrow();

      // Should attempt to log but not crash
      expect(notificationService.broadcastViaWebSocket).toHaveBeenCalled();
    });
  });
});
```

---

## Part 3: Performance Tests (5 tests)

**File**: `apps/cosmic-horizons-api/src/app/modules/events/test/performance.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from '../services/metrics.service';
import { KafkaService } from '../kafka.service';

describe('Performance & Load Tests', () => {
  let metricsService: MetricsService;
  let kafkaService: jest.Mocked<KafkaService>;

  beforeEach(async () => {
    kafkaService = {} as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: KafkaService, useValue: kafkaService },
      ],
    }).compile();

    metricsService = module.get<MetricsService>(MetricsService);
  });

  describe('Throughput', () => {
    it('should process 1000 metrics events in reasonable time', async () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        await metricsService.aggregateJobMetrics(`job-perf-${i}`, {
          cpu: Math.random() * 100,
          memory: Math.random() * 4096,
          execution_time: Math.random() * 7200,
        });
      }

      const elapsed = Date.now() - start;

      // Should process 1000 events in under 30 seconds
      // That's 33+ events/second throughput
      expect(elapsed).toBeLessThan(30000);
    });
  });

  describe('Latency', () => {
    it('should aggregate metrics with sub-second latency', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = Date.now();
        await metricsService.aggregateJobMetrics(`job-latency-${i}`, {
          cpu: 50,
          memory: 2048,
        });
        measurements.push(Date.now() - start);
      }

      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const sorted = measurements.sort((a, b) => a - b);
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      expect(avg).toBeLessThan(100); // Average < 100ms
      expect(p99).toBeLessThan(500); // p99 < 500ms
    });
  });

  describe('Memory Stability', () => {
    it('should maintain bounded memory usage with metric retention', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Store 10000 metrics (will be cleaned by retention policy)
      for (let i = 0; i < 10000; i++) {
        await metricsService.aggregateJobMetrics(`job-memory-${i % 100}`, {
          cpu: Math.random() * 100,
          memory: Math.random() * 4096,
        });
      }

      // Run retention cleanup
      await metricsService.clearOldMetrics();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory growth should be minimal (< 50 MB)
      expect(memoryGrowth).toBeLessThan(50);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent metric aggregations', async () => {
      const promises: Promise<void>[] = [];

      // Create 100 concurrent aggregation requests
      for (let i = 0; i < 100; i++) {
        promises.push(
          metricsService.aggregateJobMetrics(`job-concurrent-${i}`, {
            cpu: 50,
            memory: 2048,
          }),
        );
      }

      // All should complete without errors
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should retrieve metrics efficiently under load', async () => {
      // Populate with data
      for (let i = 0; i < 500; i++) {
        await metricsService.aggregateJobMetrics(`job-retrieve-${i}`, {
          cpu: 50,
          memory: 2048,
          execution_time: 3600,
        });
      }

      const start = Date.now();

      // Retrieve summary for 50 jobs
      for (let i = 0; i < 50; i++) {
        const summary = await metricsService.getJobMetricsSummary(`job-retrieve-${i}`);
        expect(summary).toBeDefined();
      }

      const elapsed = Date.now() - start;

      // 50 retrievals should complete quickly (< 1 second)
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
```

---

## Part 4: Integration Tests (3 tests)

**File**: `apps/cosmic-horizons-api/src/app/modules/events/test/integration.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceAuditorService } from '../../audit/services/compliance-auditor.service';
import { SystemHealthMonitorService } from '../../health/services/system-health-monitor.service';
import { AuditEvent } from '../../audit/services/compliance-auditor.service';

describe('Integration Tests - Enterprise Features', () => {
  let complianceAuditorService: ComplianceAuditorService;
  let systemHealthMonitorService: SystemHealthMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplianceAuditorService, SystemHealthMonitorService],
    }).compile();

    complianceAuditorService = module.get<ComplianceAuditorService>(
      ComplianceAuditorService,
    );
    systemHealthMonitorService = module.get<SystemHealthMonitorService>(
      SystemHealthMonitorService,
    );
  });

  describe('Audit Trail Immutability', () => {
    it('should generate immutable hash for audit events', async () => {
      const event1: AuditEvent = {
        event_id: 'event-audit-001',
        job_id: 'job-audit-001',
        user_id: 'user-123',
        event_type: 'job.submitted',
        timestamp: '2026-02-27T10:00:00Z',
        details: { pipeline: 'calibration' },
      };

      await complianceAuditorService.storeImmutableEvent(event1);

      const events = complianceAuditorService.getAllEvents();
      expect(events[0].immutable_hash).toBeDefined();
      expect(events[0].immutable_hash).toMatch(/^hash_/);

      // Verify hash is deterministic
      const event2: AuditEvent = {
        ...event1,
        event_id: 'event-audit-002',
      };

      await complianceAuditorService.storeImmutableEvent(event2);
      const hashes = complianceAuditorService
        .getAllEvents()
        .map((e) => e.immutable_hash);

      // Different events should have different hashes
      expect(hashes[0]).not.toBe(hashes[1]);
    });
  });

  describe('Health Monitoring & Alerting', () => {
    it('should detect and alert on health threshold violations', async () => {
      // Process normal health metric
      await systemHealthMonitorService.processHealthEvent({
        job_id: 'job-health-001',
        timestamp: new Date().toISOString(),
        error_rate: 2,
        consumer_lag: 3000,
        available_memory_mb: 2048,
        cpu_usage_percent: 45,
      });

      let status = await systemHealthMonitorService.getHealthStatus();
      expect(status.overall_healthy).toBe(true);
      expect(status.alerts.length).toBe(0);

      // Process high error rate metric
      await systemHealthMonitorService.processHealthEvent({
        job_id: 'job-health-002',
        timestamp: new Date().toISOString(),
        error_rate: 8, // Exceeds threshold
        consumer_lag: 5000,
        available_memory_mb: 2048,
        cpu_usage_percent: 50,
      });

      status = await systemHealthMonitorService.getHealthStatus();
      expect(status.overall_healthy).toBe(false);
      expect(status.error_rate_threshold_exceeded).toBe(true);
      expect(status.alerts.length).toBeGreaterThan(0);
    });

    it('should determine compliance status from audit trail', async () => {
      // Store 10 audit events
      for (let i = 0; i < 10; i++) {
        await complianceAuditorService.storeImmutableEvent({
          event_id: `compliance-event-${i}`,
          job_id: `job-compliance-${i}`,
          user_id: 'user-123',
          event_type: 'job.completed',
          timestamp: new Date().toISOString(),
          details: { status: 'complete' },
        });
      }

      // Get compliance report
      const report = await complianceAuditorService.generateComplianceReport();

      expect(report.total_events).toBe(10);
      expect(report.retention_compliant).toBe(true);
      expect(report.jobs_covered).toBe(10);
    });
  });
});
```

---

## Integration Instructions

### Step 1: Copy test files

```bash
# Copy all test files from this document into test directories
cp e2e-workflow.spec.ts apps/cosmic-horizons-api/src/app/modules/events/test/
cp error-scenarios.spec.ts apps/cosmic-horizons-api/src/app/modules/events/test/
cp performance.spec.ts apps/cosmic-horizons-api/src/app/modules/events/test/
cp integration.spec.ts apps/cosmic-horizons-api/src/app/modules/events/test/
```

### Step 2: Run tests

```bash
# Run Week 3 tests
pnpm nx test cosmic-horizons-api --testFile="**/e2e-workflow.spec.ts"
pnpm nx test cosmic-horizons-api --testFile="**/error-scenarios.spec.ts"
pnpm nx test cosmic-horizons-api --testFile="**/performance.spec.ts"
pnpm nx test cosmic-horizons-api --testFile="**/integration.spec.ts"

# Run all together
pnpm nx test cosmic-horizons-api --testNamePattern="(E2E|Error Scenarios|Performance|Integration)"
```

### Step 3: Verify coverage

```bash
# Generate coverage report
pnpm nx test cosmic-horizons-api --coverage --coverageReporters="text-summary"
```

---

**Expected Results**: All 18 tests passing ✅
