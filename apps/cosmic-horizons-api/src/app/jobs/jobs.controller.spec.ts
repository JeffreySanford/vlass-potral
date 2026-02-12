import { Test, TestingModule } from '@nestjs/testing';
import { JobsController } from './jobs.controller';
import { TaccIntegrationService } from './tacc-integration.service';
import { JobOrchestratorService } from './services/job-orchestrator.service';
import { DatasetStagingService } from './services/dataset-staging.service';
import { AuthenticatedRequest } from '../types/http.types';
import { Job } from './entities/job.entity';

describe('JobsController', () => {
  let controller: JobsController;
  let taccService: jest.Mocked<TaccIntegrationService>;
  let orchestrator: jest.Mocked<JobOrchestratorService>;
  let datasetStaging: jest.Mocked<DatasetStagingService>;

  const mockUser = { id: 'user-123', email: 'user@example.com', role: 'user' };
  const mockRequest = { user: mockUser } as unknown as AuthenticatedRequest;

  const mockJob: Job = {
    id: 'job-123',
    userId: mockUser.id,
    status: 'running',
    createdAt: new Date(),
    updatedAt: new Date(),
    taccJobId: 'tacc-456',
    datasetId: 'dataset-789',
    agentType: 'ImageReconstruction',
    progress: 50,
    resourceMetrics: {
      cpuUsage: 45,
      memoryUsage: 62,
      gpuUsage: 88,
    },
  } as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: TaccIntegrationService,
          useValue: {
            submitJob: jest.fn(),
            getJobStatus: jest.fn(),
            cancelJob: jest.fn(),
          },
        },
        {
          provide: JobOrchestratorService,
          useValue: {
            submitJob: jest.fn(),
            submitBatch: jest.fn(),
            getJobStatus: jest.fn(),
            cancelJob: jest.fn(),
            getJobHistory: jest.fn(),
            searchJobs: jest.fn(),
            getOptimizationTips: jest.fn(),
            getResourceMetrics: jest.fn(),
            getAvailableResourcePools: jest.fn(),
          },
        },
        {
          provide: DatasetStagingService,
          useValue: {
            stageDataset: jest.fn(),
            getStagingStatus: jest.fn(),
            validateDataset: jest.fn(),
            optimizeDatasetLayout: jest.fn(),
            estimateTransferTime: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
    taccService = module.get(TaccIntegrationService) as jest.Mocked<TaccIntegrationService>;
    orchestrator = module.get(JobOrchestratorService) as jest.Mocked<JobOrchestratorService>;
    datasetStaging = module.get(DatasetStagingService) as jest.Mocked<DatasetStagingService>;
  });

  describe('submitJob - POST /jobs/submit', () => {
    it('should submit a single job successfully', async () => {
      const submission = {
        datasetId: 'dataset-789',
        agentType: 'ImageReconstruction',
        parameters: { algorithm: 'clean', iterations: 100 },
      };

      orchestrator.submitJob.mockResolvedValue(mockJob);

      const result = await controller.submitJob(mockRequest, submission as any);

      expect(result).toEqual(mockJob);
      expect(orchestrator.submitJob).toHaveBeenCalledWith(mockUser.id, submission);
    });

    it('should handle job submission for AlphaCal agent', async () => {
      const submission = {
        datasetId: 'dataset-100',
        agentType: 'AlphaCal',
        parameters: { solveType: 'direction-dependent' },
      };

      const alphaCalJob = { ...mockJob, agentType: 'AlphaCal', id: 'job-alpha-1' };
      orchestrator.submitJob.mockResolvedValue(alphaCalJob);

      const result = await controller.submitJob(mockRequest, submission as any);

      expect(result.agentType).toBe('AlphaCal');
      expect(orchestrator.submitJob).toHaveBeenCalledWith(mockUser.id, submission);
    });

    it('should handle job submission with different dataset', async () => {
      const submission = {
        datasetId: 'dataset-custom-456',
        agentType: 'AnomalyDetection',
        parameters: { modelVersion: '2.1' },
      };

      const customJob = { ...mockJob, agentType: 'AnomalyDetection', datasetId: 'dataset-custom-456' };
      orchestrator.submitJob.mockResolvedValue(customJob);

      const result = await controller.submitJob(mockRequest, submission as any);

      expect(result.datasetId).toBe('dataset-custom-456');
    });
  });

  describe('submitBatch - POST /jobs/submit-batch', () => {
    it('should submit multiple jobs in batch', async () => {
      const batch = {
        jobs: [
          { datasetId: 'dataset-1', agentType: 'ImageReconstruction' },
          { datasetId: 'dataset-2', agentType: 'AlphaCal' },
        ],
        maxParallel: 2,
      };

      const jobs = [mockJob, { ...mockJob, id: 'job-124', agentType: 'AlphaCal' }];
      orchestrator.submitBatch.mockResolvedValue(jobs);

      const result = await controller.submitBatch(mockRequest, batch as any);

      expect(result).toHaveLength(2);
      expect(orchestrator.submitBatch).toHaveBeenCalledWith(mockUser.id, batch);
    });

    it('should respect controlled parallelism in batch', async () => {
      const batch = {
        jobs: [
          { datasetId: 'dataset-1', agentType: 'ImageReconstruction' },
          { datasetId: 'dataset-2', agentType: 'ImageReconstruction' },
          { datasetId: 'dataset-3', agentType: 'ImageReconstruction' },
        ],
        maxParallel: 1,
      };

      orchestrator.submitBatch.mockResolvedValue([mockJob]);

      const result = await controller.submitBatch(mockRequest, batch as any);

      expect(orchestrator.submitBatch).toHaveBeenCalledWith(mockUser.id, batch);
    });
  });

  describe('getJobStatus - GET /jobs/:id/status', () => {
    it('should retrieve job status', async () => {
      orchestrator.getJobStatus.mockResolvedValue(mockJob);

      const result = await controller.getJobStatus(mockJob.id);

      expect(result).toEqual(mockJob);
      expect(orchestrator.getJobStatus).toHaveBeenCalledWith(mockJob.id);
    });

    it('should handle job not found', async () => {
      orchestrator.getJobStatus.mockResolvedValue(null);

      const result = await controller.getJobStatus('nonexistent-job');

      expect(result).toBeNull();
    });

    it('should return completed job status', async () => {
      const completedJob = { ...mockJob, status: 'completed', progress: 100 };
      orchestrator.getJobStatus.mockResolvedValue(completedJob);

      const result = await controller.getJobStatus(completedJob.id);

      expect(result.status).toBe('completed');
      expect(result.progress).toBe(100);
    });
  });

  describe('cancelJob - DELETE /jobs/:id', () => {
    it('should cancel a job successfully', async () => {
      orchestrator.cancelJob.mockResolvedValue(true);

      const result = await controller.cancelJob(mockJob.id);

      expect(result).toEqual({ success: true });
      expect(orchestrator.cancelJob).toHaveBeenCalledWith(mockJob.id);
    });

    it('should handle failed job cancellation', async () => {
      orchestrator.cancelJob.mockResolvedValue(false);

      const result = await controller.cancelJob('already-completed-job');

      expect(result).toEqual({ success: false });
    });
  });

  describe('getJobHistory - GET /jobs/history/list', () => {
    it('should retrieve job history with defaults', async () => {
      const history = {
        jobs: [mockJob],
        total: 1,
      };
      orchestrator.getJobHistory.mockResolvedValue(history);

      const result = await controller.getJobHistory(mockRequest);

      expect(result.jobs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(orchestrator.getJobHistory).toHaveBeenCalledWith(mockUser.id, 50, 0);
    });

    it('should respect limit and offset parameters', async () => {
      const history = {
        jobs: [mockJob, { ...mockJob, id: 'job-125' }],
        total: 15,
      };
      orchestrator.getJobHistory.mockResolvedValue(history);

      const result = await controller.getJobHistory(mockRequest, '10', '5');

      expect(result.jobs).toHaveLength(2);
      expect(result.total).toBe(15);
      expect(orchestrator.getJobHistory).toHaveBeenCalledWith(mockUser.id, 10, 5);
    });

    it('should return empty history for new user', async () => {
      orchestrator.getJobHistory.mockResolvedValue({ jobs: [], total: 0 });

      const result = await controller.getJobHistory(mockRequest);

      expect(result.jobs).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('searchJobs - GET /jobs/search', () => {
    it('should search jobs with filters', async () => {
      const filters = { status: 'completed', agentType: 'ImageReconstruction' };
      const results = { jobs: [mockJob], total: 1 };
      orchestrator.searchJobs.mockResolvedValue(results);

      const result = await controller.searchJobs(mockRequest, filters);

      expect(result.jobs).toHaveLength(1);
      expect(orchestrator.searchJobs).toHaveBeenCalledWith(mockUser.id, filters, 50, 0);
    });

    it('should search jobs by agent type', async () => {
      const filters = { agentType: 'AlphaCal' };
      orchestrator.searchJobs.mockResolvedValue({ jobs: [mockJob], total: 1 });

      const result = await controller.searchJobs(mockRequest, filters);

      expect(orchestrator.searchJobs).toHaveBeenCalledWith(mockUser.id, filters, 50, 0);
    });

    it('should handle pagination in search results', async () => {
      const filters = { status: 'running' };
      orchestrator.searchJobs.mockResolvedValue({ jobs: [mockJob], total: 25 });

      const result = await controller.searchJobs(mockRequest, filters, '10', '20');

      expect(orchestrator.searchJobs).toHaveBeenCalledWith(mockUser.id, filters, 10, 20);
    });
  });

  describe('getOptimizationTips - POST /jobs/optimize', () => {
    it('should return optimization tips for job configuration', async () => {
      const submission = {
        datasetId: 'dataset-789',
        agentType: 'ImageReconstruction',
        parameters: { algorithm: 'clean' },
      };
      const tips = [
        { category: 'performance', message: 'Increase iterations for better quality' },
      ];
      orchestrator.getOptimizationTips.mockResolvedValue(tips);

      const result = await controller.getOptimizationTips(submission as any);

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('performance');
      expect(orchestrator.getOptimizationTips).toHaveBeenCalledWith(submission);
    });

    it('should provide cost optimization recommendations', async () => {
      const submission = {
        datasetId: 'dataset-789',
        agentType: 'AlphaCal',
        parameters: { gpuCount: 8 },
      };
      const tips = [
        { category: 'cost', message: 'Consider using 4 GPUs instead' },
      ];
      orchestrator.getOptimizationTips.mockResolvedValue(tips);

      const result = await controller.getOptimizationTips(submission as any);

      expect(result[0].category).toBe('cost');
    });

    it('should handle empty optimization tips', async () => {
      const submission = {
        datasetId: 'dataset-optimal',
        agentType: 'ImageReconstruction',
      };
      orchestrator.getOptimizationTips.mockResolvedValue([]);

      const result = await controller.getOptimizationTips(submission as any);

      expect(result).toHaveLength(0);
    });
  });

  describe('getResourceMetrics - GET /jobs/metrics', () => {
    it('should retrieve resource metrics for user', async () => {
      const metrics = {
        totalJobsSubmitted: 15,
        totalComputeHours: 245.5,
        estimatedCost: 1227.50,
        averageJobDuration: 16.37,
      };
      orchestrator.getResourceMetrics.mockResolvedValue(metrics);

      const result = await controller.getResourceMetrics(mockRequest);

      expect(result.totalJobsSubmitted).toBe(15);
      expect(result.estimatedCost).toBe(1227.50);
      expect(orchestrator.getResourceMetrics).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return zero metrics for new user', async () => {
      orchestrator.getResourceMetrics.mockResolvedValue({
        totalJobsSubmitted: 0,
        totalComputeHours: 0,
        estimatedCost: 0,
        averageJobDuration: 0,
      });

      const result = await controller.getResourceMetrics(mockRequest);

      expect(result.totalJobsSubmitted).toBe(0);
    });
  });

  describe('getAvailableResources - GET /jobs/resources/available', () => {
    it('should retrieve available GPU resource pools', async () => {
      const resources = {
        gpuPools: [
          { name: 'tesla-v100', available: 8, totalCapacity: 16 },
          { name: 'tesla-a100', available: 4, totalCapacity: 8 },
        ],
      };
      orchestrator.getAvailableResourcePools.mockResolvedValue(resources);

      const result = await controller.getAvailableResources();

      expect(result.gpuPools).toHaveLength(2);
      expect(result.gpuPools[0].name).toBe('tesla-v100');
    });

    it('should handle resource constraints', async () => {
      const resources = {
        gpuPools: [
          { name: 'tesla-a100', available: 0, totalCapacity: 8 },
        ],
      };
      orchestrator.getAvailableResourcePools.mockResolvedValue(resources);

      const result = await controller.getAvailableResources();

      expect(result.gpuPools[0].available).toBe(0);
    });
  });

  describe('stageDataset - POST /jobs/dataset/stage', () => {
    it('should stage dataset for processing', async () => {
      const request = {
        datasetId: 'dataset-789',
        source: 'archive',
        destination: 'compute-node',
      };
      const status = {
        datasetId: 'dataset-789',
        status: 'staging',
        bytesTransferred: 0,
        totalBytes: 1e12,
        estimatedTimeRemaining: 3600,
      };
      datasetStaging.stageDataset.mockResolvedValue(status);

      const result = await controller.stageDataset(request as any);

      expect(result.status).toBe('staging');
      expect(datasetStaging.stageDataset).toHaveBeenCalledWith(request);
    });

    it('should handle dataset already staged', async () => {
      const request = {
        datasetId: 'dataset-staged',
        source: 'archive',
        destination: 'compute-node',
      };
      const status = {
        datasetId: 'dataset-staged',
        status: 'completed',
        bytesTransferred: 1e12,
        totalBytes: 1e12,
      };
      datasetStaging.stageDataset.mockResolvedValue(status);

      const result = await controller.stageDataset(request as any);

      expect(result.status).toBe('completed');
    });
  });

  describe('getStagingStatus - GET /jobs/dataset/:id/staging-status', () => {
    it('should retrieve dataset staging status', async () => {
      const status = {
        datasetId: 'dataset-789',
        status: 'in-progress',
        bytesTransferred: 5e11,
        totalBytes: 1e12,
        estimatedTimeRemaining: 1800,
      };
      datasetStaging.getStagingStatus.mockResolvedValue(status);

      const result = await controller.getStagingStatus('dataset-789');

      expect(result.status).toBe('in-progress');
      expect(datasetStaging.getStagingStatus).toHaveBeenCalledWith('dataset-789');
    });

    it('should handle dataset not found', async () => {
      datasetStaging.getStagingStatus.mockResolvedValue(null);

      const result = await controller.getStagingStatus('nonexistent');

      expect(result).toBeNull();
    });

    it('should return completed staging status', async () => {
      const status = {
        datasetId: 'dataset-complete',
        status: 'completed',
        bytesTransferred: 1e12,
        totalBytes: 1e12,
        completedAt: new Date(),
      };
      datasetStaging.getStagingStatus.mockResolvedValue(status);

      const result = await controller.getStagingStatus('dataset-complete');

      expect(result.status).toBe('completed');
    });
  });

  describe('validateDataset - GET /jobs/dataset/:id/validate', () => {
    it('should validate dataset readiness', async () => {
      const validation = {
        isValid: true,
        issues: [],
        estimatedProcessingTime: 3600,
      };
      datasetStaging.validateDataset.mockResolvedValue(validation);

      const result = await controller.validateDataset('dataset-789');

      expect(result.isValid).toBe(true);
      expect(datasetStaging.validateDataset).toHaveBeenCalledWith('dataset-789');
    });

    it('should report validation errors', async () => {
      const validation = {
        isValid: false,
        issues: ['Missing metadata', 'Corrupted calibration data'],
      };
      datasetStaging.validateDataset.mockResolvedValue(validation);

      const result = await controller.validateDataset('dataset-invalid');

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('optimizeDataset - GET /jobs/dataset/:id/optimize', () => {
    it('should provide dataset optimization recommendations', async () => {
      const optimization = {
        recommendations: [
          { type: 'compression', benefit: 'Reduce size by 30%' },
        ],
        estimatedSpeedup: 1.25,
      };
      datasetStaging.optimizeDatasetLayout.mockResolvedValue(optimization);

      const result = await controller.optimizeDataset('dataset-789');

      expect(result.recommendations).toHaveLength(1);
      expect(datasetStaging.optimizeDatasetLayout).toHaveBeenCalledWith('dataset-789');
    });

    it('should suggest data layout improvements', async () => {
      const optimization = {
        recommendations: [
          { type: 'layout', benefit: 'Improve I/O performance by 45%' },
        ],
        estimatedSpeedup: 1.45,
      };
      datasetStaging.optimizeDatasetLayout.mockResolvedValue(optimization);

      const result = await controller.optimizeDataset('dataset-optimize');

      expect(result.estimatedSpeedup).toBeGreaterThan(1);
    });
  });

  describe('estimateTransferTime - POST /jobs/dataset/estimate-transfer', () => {
    it('should estimate data transfer time', async () => {
      const estimate = {
        sizeGb: 1000,
        estimatedTimeSeconds: 3600,
        recommendedStrategy: 'parallel-streams',
      };
      datasetStaging.estimateTransferTime.mockResolvedValue(estimate);

      const result = await controller.estimateTransferTime({ size_gb: 1000 });

      expect(result.estimatedTimeSeconds).toBe(3600);
      expect(datasetStaging.estimateTransferTime).toHaveBeenCalledWith(1000);
    });

    it('should handle small dataset transfer', async () => {
      const estimate = {
        sizeGb: 10,
        estimatedTimeSeconds: 36,
        recommendedStrategy: 'single-stream',
      };
      datasetStaging.estimateTransferTime.mockResolvedValue(estimate);

      const result = await controller.estimateTransferTime({ size_gb: 10 });

      expect(result.estimatedTimeSeconds).toBeLessThan(60);
    });

    it('should recommend parallel transfer for large datasets', async () => {
      const estimate = {
        sizeGb: 5000,
        estimatedTimeSeconds: 7200,
        recommendedStrategy: 'parallel-streams',
        recommendedStreamCount: 32,
      };
      datasetStaging.estimateTransferTime.mockResolvedValue(estimate);

      const result = await controller.estimateTransferTime({ size_gb: 5000 });

      expect(result.recommendedStrategy).toBe('parallel-streams');
    });
  });
});
