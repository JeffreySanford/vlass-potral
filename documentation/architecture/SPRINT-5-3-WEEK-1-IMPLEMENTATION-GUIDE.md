# Sprint 5.3 Week 1: Implementation Guide

## Job Orchestrator Kafka Event Publishing

**Date**: February 15, 2026  
**Duration**: Week 1 (Feb 15-20)  
**Goal**: Implement job lifecycle event publishing (15 tests)

---

## Overview

Week 1 focuses on integrating KafkaService into JobOrchestratorService to publish all job lifecycle events. By Friday Feb 20, the service should publish:

- `job.submitted` - Initial job submission
- `job.queued` - After TACC submission
- `job.running` - Status change from TACC
- `job.completed` - Job completion with timing
- `job.failed` - Job failure with error details
- `job.cancelled` - User cancellation with reason
- Event metrics and headers

---

## Daily Breakdown

### Day 1-2 (Feb 15-16): Setup & First Events

**Morning (Friday Feb 15)**

1. **Review**:
   - [ ] Read [SPRINT-5-3-KICKOFF-PLAN.md](../SPRINT-5-3-KICKOFF-PLAN.md)
   - [ ] Review existing `job-orchestrator.service.ts`
   - [ ] Review existing test file structure

2. **Setup**:

   ```bash
   # Verify tests compile
   pnpm nx test cosmic-horizons-api --watch

   # Verify Kafka running
   pnpm run start:infra

   # Check topics created
   docker exec kafka-1 kafka-topics.sh --list --bootstrap-server localhost:9092
   ```

3. **Modify JobOrchestratorService**:

   ```typescript
   // File: apps/cosmic-horizons-api/src/app/jobs/services/job-orchestrator.service.ts

   import { KafkaService } from '../../modules/events/kafka.service';
   import { KAFKA_TOPICS } from '@cosmic-horizons/event-models';

   export class JobOrchestratorService {
     constructor(
       private jobRepository: JobRepository,
       private taccService: TaccIntegrationService,
       private kafkaService: KafkaService,  // ← ADD THIS
       private logger: Logger,
     ) {}

     async submitJob(request: SubmitJobRequest): Promise<Job> {
       // 1. Create job in database
       const job = await this.jobRepository.create({
         user_id: request.userId,
         agent: request.agent,
         dataset_id: request.datasetId,
         params: request.parameters,
         status: 'QUEUED',
       });

       // 2. Publish job.submitted event
       try {
         await this.kafkaService.publishJobLifecycleEvent(
           {
             event_type: 'job.submitted',
             job_id: job.id,
             user_id: request.userId,
             payload: {
               agent: job.agent,
               dataset_id: job.dataset_id,
               parameters: job.params,
             },
           },
           job.id  // partition key for ordering
         );
       } catch (error) {
         this.logger.error(`Failed to publish job.submitted: ${error.message}`);
         // Continue - job was created, event publishing is auxiliary
       }

       // 3. Submit to TACC
       try {
         const taccResponse = await this.taccService.submitJob(job);

         // 4. Publish job.queued event
         await this.kafkaService.publishJobLifecycleEvent(
           {
             event_type: 'job.queued',
             job_id: job.id,
             tac_job_id: taccResponse.jobId,
             queued_timestamp: new Date().toISOString(),
           },
           job.id
         );
       } catch (error) {
         // Update job status to failed
         await this.jobRepository.updateStatus(job.id, 'FAILED');
         throw error;
       }

       return job;
     }
   }
   ```

**Afternoon**:

4. **Add Tests**:
   - [ ] Extend `job-orchestrator.service.spec.ts`
   - [ ] Add test: "should publish job.submitted event with partition key"
   - [ ] Add test: "should include job details in payload"
   - [ ] Add test: "should include correlation_id in event headers"

**End of Day Assessment**:

- [ ] 3 new tests added
- [ ] All tests passing
- [ ] No TypeScript errors

---

### Day 2 (Feb 16): Status Transitions

**Morning**:

1. **Implement status change publishing**:

   ```typescript
   async onJobStatusChange(jobId: string, newStatus: JobStatus): Promise<void> {
     const job = await this.jobRepository.findById(jobId);
     const previousStatus = job.status;

     // Update database
     await this.jobRepository.updateStatus(jobId, newStatus);

     // Publish event
     await this.kafkaService.publishJobLifecycleEvent(
       {
         event_type: 'job.status_changed',
         job_id: jobId,
         previous_status: previousStatus,
         current_status: newStatus,
         status_changed_timestamp: new Date().toISOString(),
       },
       jobId  // partition key
     );
   }

   async onJobCompleted(jobId: string, executionTime: number): Promise<void> {
     await this.jobRepository.updateStatus(jobId, 'COMPLETED');

     await this.kafkaService.publishJobLifecycleEvent(
       {
         event_type: 'job.completed',
         job_id: jobId,
         execution_time_seconds: executionTime,
         completion_timestamp: new Date().toISOString(),
       },
       jobId
     );
   }

   async onJobFailed(jobId: string, error: JobError): Promise<void> {
     await this.jobRepository.updateStatus(jobId, 'FAILED');

     await this.kafkaService.publishJobLifecycleEvent(
       {
         event_type: 'job.failed',
         job_id: jobId,
         error_code: error.code,
         error_message: error.message,
         failure_timestamp: new Date().toISOString(),
       },
       jobId
     );
   }

   async cancelJob(jobId: string, userId: string, reason: string): Promise<void> {
     await this.jobRepository.updateStatus(jobId, 'CANCELLED');

     await this.kafkaService.publishJobLifecycleEvent(
       {
         event_type: 'job.cancelled',
         job_id: jobId,
         cancelled_by: userId,
         cancellation_reason: reason,
         cancellation_timestamp: new Date().toISOString(),
       },
       jobId
     );
   }
   ```

2. **Add Tests** (6 total):
   - [ ] Publish job.queued after TACC submission
   - [ ] Publish job.running on status change
   - [ ] Publish job.completed with execution time
   - [ ] Publish job.failed with error details
   - [ ] Publish job.cancelled with reason
   - [ ] Preserve status transition ordering

---

### Day 3 (Feb 17): Ordering & Headers

**Focus**: Partition keys and event headers

1. **Verify partition key implementation**:

   ```typescript
   // In KafkaService.publishJobLifecycleEvent()
   // partition key = jobId ensures:
   // - All events for same job go to same partition
   // - Events are ordered per job
   // - Different jobs can go to different partitions (parallelism)
   ```

2. **Add Tests** (3 total):
   - [ ] Use job_id as partition key for consistent ordering
   - [ ] Handle 10+ concurrent jobs without conflicts
   - [ ] Guarantee event ordering within single job lifecycle

**Test Example**:

```typescript
it('should use job_id as partition key for consistent ordering', async () => {
  // 1. Create multiple jobs
  const job1 = await service.submitJob({ userId: 'u1', ... });
  const job2 = await service.submitJob({ userId: 'u2', ... });

  // 2. Verify partition keys
  expect(kafkaService.publishJobLifecycleEvent).toHaveBeenCalledWith(
    expect.objectContaining({ event_type: 'job.submitted', job_id: job1.id }),
    job1.id  // ← partition key
  );
  
  expect(kafkaService.publishJobLifecycleEvent).toHaveBeenCalledWith(
    expect.objectContaining({ event_type: 'job.submitted', job_id: job2.id }),
    job2.id  // ← partition key
  );
});
```

---

### Day 4 (Feb 18): Metrics & Error Handling

**Morning**:

1. **Implement metrics publishing**:

   ```typescript
   async publishJobMetrics(jobId: string, metrics: JobMetrics): Promise<void> {
     await this.kafkaService.publishJobMetrics(
       {
         event_type: 'job.metrics_recorded',
         job_id: jobId,
         cpu_usage_percent: metrics.cpuUsage,
         memory_usage_mb: metrics.memoryUsage,
         io_operations: metrics.ioOps,
         timestamp: new Date().toISOString(),
       },
       jobId  // partition key
     );
   }
   ```

2. **Add Tests** (2 error handling + 1 metrics):
   - [ ] Publish failure should retry
   - [ ] Provide meaningful error messages
   - [ ] Include standard headers (content-type, correlation-id, timestamp)

---

### Day 5 (Feb 19-20): Integration & Validation

**Thursday Feb 19**:

1. **Integration Test**:

   ```typescript
   it('should execute complete job submission → queued flow', async () => {
     // 1. Mock TACC submission
     taccService.submitJob.mockResolvedValue({ jobId: 'tacc-123' });

     // 2. Submit job
     const job = await service.submitJob({
       userId: 'user-1',
       agent: 'AlphaCal',
       datasetId: 'dataset-1',
       parameters: {},
     });

     // 3. Assert both events published in order
     expect(kafkaService.publishJobLifecycleEvent).toHaveBeenCalledTimes(2);
     
     // First call: job.submitted
     expect(kafkaService.publishJobLifecycleEvent).toHaveBeenNthCalledWith(
       1,
       expect.objectContaining({
         event_type: 'job.submitted',
         job_id: job.id,
       }),
       job.id  // partition key
     );

     // Second call: job.queued
     expect(kafkaService.publishJobLifecycleEvent).toHaveBeenNthCalledWith(
       2,
       expect.objectContaining({
         event_type: 'job.queued',
         job_id: job.id,
         tac_job_id: 'tacc-123',
       }),
       job.id  // partition key
     );
   });
   ```

2. **Friday Feb 20 - Final Validation**:
   - [ ] All 15 tests passing
   - [ ] Run: `pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts"`
   - [ ] Expected output: 15/15 tests ✅
   - [ ] Zero TypeScript errors
   - [ ] Update [SPRINT-5-3-PROGRESS.md](../SPRINT-5-3-PROGRESS.md) with completion

---

## Test Matrix (15 Tests)

### Job Submitted Events (3)

- [ ] Publish with partition key
- [ ] Include job details
- [ ] Include correlation_id

### Status Transitions (6)

- [ ] Publish job.queued after TACC
- [ ] Publish job.running
- [ ] Publish job.completed with time
- [ ] Publish job.failed with error
- [ ] Publish job.cancelled with reason
- [ ] Preserve transition ordering

### Ordering & Keys (3)

- [ ] Use job_id as partition key
- [ ] Handle 10+ concurrent jobs
- [ ] Guarantee event ordering

### Error & Metrics (2)

- [ ] Handle publish failure & retry
- [ ] Meaningful error messages

### Headers (1)

- [ ] Include standard headers

---

## Code Checklist

**JobOrchestratorService Modifications**:

- [ ] Import KafkaService
- [ ] Inject KafkaService in constructor
- [ ] Add publishJobSubmitted() method
- [ ] Add publishJobQueued() method
- [ ] Add publishJobRunning() method
- [ ] Add publishJobCompleted() method
- [ ] Add publishJobFailed() method
- [ ] Add publishJobCancelled() method
- [ ] Add publishJobMetrics() method
- [ ] Error handling on publish failures
- [ ] Partition key = job_id on all publishes

**Test File Additions**:

- [ ] 3 job.submitted tests
- [ ] 6 status transition tests
- [ ] 3 partition key tests
- [ ] 2 error handling tests
- [ ] 1 headers test

---

## Running Tests

```bash
# Daily test run (watch mode)
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts" --watch

# Final validation (Friday)
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts" --watch=false

# With coverage
pnpm test:coverage:api

# All API tests (including Week 1)
pnpm nx test cosmic-horizons-api
```

---

## Monitoring & Tracking

**Daily Update Template** (Copy to [SPRINT-5-3-PROGRESS.md](../SPRINT-5-3-PROGRESS.md)):

```text
**Daily Log - Week 1**:

**Monday Feb 15** (Setup & First Events):
- [ ] Setup complete
- [ ] job.submitted publishing implemented
- [ ] job.queued publishing implemented
- [ ] 3 tests written and passing
- Blockers: None

**Tuesday Feb 16** (Status Transitions):
- [ ] job.running publishing implemented
- [ ] job.completed publishing implemented
- [ ] job.failed publishing implemented
- [ ] job.cancelled publishing implemented
- [ ] 6 status transition tests written and passing
- Blockers: None

**Wednesday Feb 17** (Ordering & Keys):
- [ ] Partition key validation implemented
- [ ] Concurrent job handling tested
- [ ] 3 ordering tests written and passing
- Blockers: None

**Thursday Feb 18** (Metrics & Error):
- [ ] Metrics publishing implemented
- [ ] Error handling with retry implemented
- [ ] 2 error handling tests written and passing
- [ ] 1 headers test written and passing
- Blockers: None

**Friday Feb 19-20** (Integration & Validation):
- [ ] Integration test written and passing
- [ ] All 15 tests passing (15/15) ✅
- [ ] TypeScript errors: 0 ✅
- [ ] Code review ready
- Week 1 Status: ✅ COMPLETE
```

---

## Week 1 Success Criteria

**By EOD Friday, February 20**:

✅ **Code**:

- [ ] All job event publishing methods implemented
- [ ] 15 comprehensive tests written
- [ ] 100% of tests passing (15/15)
- [ ] Zero TypeScript errors
- [ ] Zero ESLint warnings

✅ **Functionality**:

- [ ] job.submitted events published
- [ ] All status transitions covered
- [ ] Partition keys working correctly
- [ ] Correlation IDs propagated
- [ ] Error handling working

✅ **Documentation**:

- [ ] Code comments added
- [ ] Commit messages clear
- [ ] Ready for Week 2 review

---

## Week 1 to Week 2 Handoff

**Friday EOD Deliverables**:

1. Merge Week 1 code to main branch
2. Document any findings for Week 2
3. List blockers or dependencies
4. Update SPRINT-5-3-PROGRESS.md
5. Tag: Sprint-5-3-Week-1-Complete

**Week 2 Readiness**:

- [ ] JobOrchestratorService fully integrated with Kafka
- [ ] 15 tests passing and serving as regression suite
- [ ] Ready for MetricsService consumer integration
- [ ] Ready for NotificationService consumer integration

---

## References

- **Kickoff Plan**: [SPRINT-5-3-KICKOFF-PLAN.md](../SPRINT-5-3-KICKOFF-PLAN.md)
- **Test Builders**: [kafka-test-builders.ts](../apps/cosmic-horizons-api/src/app/modules/events/test/kafka-test-builders.ts)
- **Kafka Service**: [kafka.service.ts](../apps/cosmic-horizons-api/src/app/modules/events/kafka.service.ts)
- **Event Models**: [@cosmic-horizons/event-models](../libs/shared/event-models/src/index.ts)

---

## Support

**Questions?** Check:

1. [ADR-EVENT-STREAMING.md](../ADR-EVENT-STREAMING.md) - Architecture decisions
2. [SPRINT-5-2-KAFKA-IMPLEMENTATION.md](../SPRINT-5-2-KAFKA-IMPLEMENTATION.md) - KafkaService patterns
3. Existing test examples in `kafka.service.spec.ts`

**Blocked?** Reach out to Sprint Lead immediately.

---

**Week 1: Ready to Execute on Feb 15** ✅
