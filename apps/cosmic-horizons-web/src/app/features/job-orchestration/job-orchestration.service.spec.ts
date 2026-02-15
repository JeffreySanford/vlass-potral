import { TestBed } from '@angular/core/testing';
import { JobOrchestrationService } from './job-orchestration.service';
import { describe, it, expect, beforeEach } from 'vitest';

describe('JobOrchestrationService', () => {
  let service: JobOrchestrationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [JobOrchestrationService],
    });
    service = TestBed.inject(JobOrchestrationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get agents', async () => {
    let agentsLoaded = false;
    service.getAgents().subscribe(agents => {
      if (agents.length === 3 && agents[0].name === 'AlphaCal') {
        agentsLoaded = true;
      }
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(agentsLoaded).toBe(true);
  });

  it('should submit job', async () => {
    const request = {
      name: 'Test Job',
      agentId: 'alphacal-001',
      parameters: {},
    };

    let submitted = false;
    service.submitJob(request).subscribe(response => {
      expect(response.jobId).toBeTruthy();
      expect(response.status).toBe('queued');
      submitted = true;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(submitted).toBe(true);
  });

  it('should retrieve jobs', async () => {
    let retrieved = false;
    service.getJobs().subscribe(jobs => {
      retrieved = Array.isArray(jobs);
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(retrieved).toBe(true);
  });

  it('should cancel job', async () => {
    const request = {
      name: 'Test Job',
      agentId: 'alphacal-001',
      parameters: {},
    };

    let cancelled = false;
    service.submitJob(request).subscribe(response => {
      service.cancelJob(response.jobId).subscribe(() => {
        service.getJobById(response.jobId).subscribe(job => {
          if (job?.status === 'cancelled') {
            cancelled = true;
          }
        });
      });
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cancelled).toBe(true);
  });
});
