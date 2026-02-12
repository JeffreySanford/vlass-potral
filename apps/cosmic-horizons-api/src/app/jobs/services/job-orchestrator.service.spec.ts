import { Test, TestingModule } from '@nestjs/testing';
import { JobRepository } from '../repositories/job.repository';
import { JobOrchestratorService } from '../services/job-orchestrator.service';
import { TaccIntegrationService } from '../tacc-integration.service';
import { Job } from '../entities/job.entity';

describe('JobOrchestratorService', () => {
  let service: JobOrchestratorService;
  let jobRepository: jest.Mocked<JobRepository>;
  let taccService: jest.Mocked<TaccIntegrationService>;

  const mockJob: Job = {
    id: 'job-1',
    user_id: 'user-1',
    agent: 'AlphaCal',
    dataset_id: 'dataset-1',
    status: 'QUEUED',
    progress: 0,
    params: { rfi_strategy: 'medium', gpu_count: 2 },
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobOrchestratorService,
        {
          provide: JobRepository,
          useValue: {
            create: jest.fn().mockResolvedValue(mockJob),
            findById: jest.fn().mockResolvedValue(mockJob),
            findByUser: jest.fn().mockResolvedValue([[mockJob], 1]),
            updateStatus: jest.fn().mockResolvedValue(undefined),
            updateProgress: jest.fn().mockResolvedValue(undefined),
            updateResult: jest.fn().mockResolvedValue(undefined),
            search: jest.fn().mockResolvedValue([[mockJob], 1]),
            delete: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TaccIntegrationService,
          useValue: {
            submitJob: jest.fn().mockResolvedValue({ jobId: 'tacc-123' }),
            getJobStatus: jest.fn().mockResolvedValue({ id: 'tacc-123', status: 'RUNNING', progress: 0.5 }),
            cancelJob: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<JobOrchestratorService>(JobOrchestratorService);
    jobRepository = module.get(JobRepository) as jest.Mocked<JobRepository>;
    taccService = module.get(TaccIntegrationService) as jest.Mocked<TaccIntegrationService>;
  });

  describe('submitJob', () => {
    it('should create and submit a job', async () => {
      const submission = {
        agent: 'AlphaCal' as const,
        dataset_id: 'dataset-1',
        params: { rfi_strategy: 'medium' as const, gpu_count: 2 },
      };

      const result = await service.submitJob('user-1', submission);

      expect(jobRepository.create).toHaveBeenCalledWith({
        user_id: 'user-1',
        agent: 'AlphaCal',
        dataset_id: 'dataset-1',
        params: submission.params,
        gpu_count: 2,
      });
      expect(taccService.submitJob).toHaveBeenCalledWith(submission);
      expect(result).toBeDefined();
    });

    it('should handle job submission errors', async () => {
      taccService.submitJob.mockRejectedValueOnce(new Error('TACC API error'));

      const submission = {
        agent: 'AlphaCal' as const,
        dataset_id: 'dataset-1',
        params: { rfi_strategy: 'medium' as const },
      };

      await expect(service.submitJob('user-1', submission)).rejects.toThrow();
      expect(jobRepository.updateStatus).toHaveBeenCalledWith(expect.any(String), 'FAILED');
    });
  });

  describe('submitBatch', () => {
    it('should submit multiple jobs respecting parallel limit', async () => {
      const submissions = [
        { agent: 'AlphaCal' as const, dataset_id: 'dataset-1', params: {} },
        { agent: 'ImageReconstruction' as const, dataset_id: 'dataset-2', params: {} },
        { agent: 'AnomalyDetection' as const, dataset_id: 'dataset-3', params: {} },
      ];

      const result = await service.submitBatch('user-1', {
        jobs: submissions,
        parallelLimit: 2,
      });

      expect(result.length).toBe(3);
      expect(taccService.submitJob).toHaveBeenCalledTimes(3);
    });

    it('should handle batch with given parallel limit', async () => {
      const batch = {
        jobs: [
          { agent: 'AlphaCal' as const, dataset_id: 'd-1', params: {} },
          { agent: 'AlphaCal' as const, dataset_id: 'd-2', params: {} },
          { agent: 'AlphaCal' as const, dataset_id: 'd-3', params: {} },
          { agent: 'AlphaCal' as const, dataset_id: 'd-4', params: {} },
        ],
        parallelLimit: 2,
      };

      await service.submitBatch('user-1', batch);

      expect(taccService.submitJob).toHaveBeenCalledTimes(4);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      const result = await service.getJobStatus('job-1');

      expect(result).toEqual(mockJob);
      expect(jobRepository.findById).toHaveBeenCalledWith('job-1');
    });

    it('should return null for non-existent job', async () => {
      jobRepository.findById.mockResolvedValueOnce(null);

      const result = await service.getJobStatus('nonexistent');

      expect(result).toBeNull();
    });

    it('should fetch latest TACC status for running jobs', async () => {
      const runningJob = { ...mockJob, status: 'RUNNING' as const, tacc_job_id: 'tacc-123' };
      jobRepository.findById.mockResolvedValueOnce(runningJob);

      await service.getJobStatus('job-1');

      expect(taccService.getJobStatus).toHaveBeenCalledWith('tacc-123');
    });
  });

  describe('getOptimizationTips', () => {
    it('should provide GPU optimization recommendations', async () => {
      const submission = {
        agent: 'ImageReconstruction' as const,
        dataset_id: 'dataset-1',
        params: { gpu_count: 5 },
      };

      const tips = await service.getOptimizationTips(submission);

      expect(tips.some(t => t.category === 'cost')).toBe(true); // High GPU count triggers cost warning
    });

    it('should warn when GPU count is missing', async () => {
      const submission = {
        agent: 'ImageReconstruction' as const,
        dataset_id: 'dataset-1',
        params: {},
      };

      const tips = await service.getOptimizationTips(submission);

      expect(tips.some(t => t.category === 'gpu')).toBe(true);
    });

    it('should recommend RFI strategy', async () => {
      const submission = {
        agent: 'AlphaCal' as const,
        dataset_id: 'dataset-1',
        params: {},
      };

      const tips = await service.getOptimizationTips(submission);

      expect(tips.some(t => t.category === 'rfi_strategy')).toBe(true);
    });

    it('should recommend max runtime', async () => {
      const submission = {
        agent: 'ImageReconstruction' as const,
        dataset_id: 'dataset-1',
        params: { rfi_strategy: 'high_sensitivity' as const },
      };

      const tips = await service.getOptimizationTips(submission);

      expect(tips.some(t => t.category === 'runtime')).toBe(true);
    });
  });

  describe('getResourceMetrics', () => {
    it('should calculate resource metrics from job history', async () => {
      const metrics = await service.getResourceMetrics('user-1');

      expect(metrics.successRate).toBeDefined();
      expect(metrics.totalGpuCount).toBeDefined();
      expect(metrics.averageRuntime).toBeDefined();
      expect(metrics.estimatedCost).toBeDefined();
    });

    it('should return zero metrics for no jobs', async () => {
      jobRepository.findByUser.mockResolvedValueOnce([[], 0]);

      const metrics = await service.getResourceMetrics('user-1');

      expect(metrics.successRate).toBe(0);
      expect(metrics.totalGpuCount).toBe(0);
    });
  });

  describe('getAvailableResourcePools', () => {
    it('should return available resource information', async () => {
      const pools = await service.getAvailableResourcePools();

      expect(Array.isArray(pools)).toBe(true);
      expect(pools.length).toBeGreaterThan(0);
      expect(pools[0]).toHaveProperty('totalGpus');
      expect(pools[0]).toHaveProperty('availableGpus');
    });
  });

  describe('cancelJob', () => {
    it('should cancel a running job', async () => {
      const runningJob = { ...mockJob, status: 'RUNNING' as const, tacc_job_id: 'tacc-123' };
      jobRepository.findById.mockResolvedValueOnce(runningJob);

      const result = await service.cancelJob('job-1');

      expect(result).toBe(true);
      expect(taccService.cancelJob).toHaveBeenCalledWith('tacc-123');
      expect(jobRepository.updateStatus).toHaveBeenCalledWith('job-1', 'CANCELLED');
    });

    it('should not cancel completed jobs', async () => {
      const completedJob = { ...mockJob, status: 'COMPLETED' as const };
      jobRepository.findById.mockResolvedValueOnce(completedJob);

      const result = await service.cancelJob('job-1');

      expect(result).toBe(false);
      expect(taccService.cancelJob).not.toHaveBeenCalled();
    });

    it('should return false for non-existent job', async () => {
      jobRepository.findById.mockResolvedValueOnce(null);

      const result = await service.cancelJob('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getJobHistory', () => {
    it('should retrieve user job history', async () => {
      const result = await service.getJobHistory('user-1', 50, 0);

      expect(result.jobs).toBeDefined();
      expect(result.total).toBeDefined();
      expect(jobRepository.findByUser).toHaveBeenCalledWith('user-1', 50, 0);
    });
  });

  describe('searchJobs', () => {
    it('should search jobs with filters', async () => {
      const filters = { agent: 'AlphaCal', status: 'COMPLETED' };

      const result = await service.searchJobs('user-1', filters, 50, 0);

      expect(result.jobs).toBeDefined();
      expect(result.total).toBeDefined();
    });
  });
});
