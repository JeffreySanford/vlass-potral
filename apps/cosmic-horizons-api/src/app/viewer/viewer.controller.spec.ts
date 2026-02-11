import { ForbiddenException } from '@nestjs/common';
import { ViewerController } from './viewer.controller';
import { ViewerService } from './viewer.service';

describe('ViewerController', () => {
  const viewerService = {
    getCutoutTelemetry: jest.fn().mockReturnValue({
      requests_total: 0,
      success_total: 0,
      failure_total: 0,
      provider_attempts_total: 0,
      provider_failures_total: 0,
      cache_hits_total: 0,
      resolution_fallback_total: 0,
      survey_fallback_total: 0,
      provider_fallback_total: 0,
      primary_success_total: 0,
      secondary_success_total: 0,
      consecutive_failures: 0,
      last_success_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      recent_failures: [],
    }),
  } as unknown as ViewerService;

  const controller = new ViewerController(viewerService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns telemetry for admin users', () => {
    const response = controller.getCutoutTelemetry({
      user: {
        role: 'admin',
      },
    } as never);

    expect(viewerService.getCutoutTelemetry).toHaveBeenCalledWith();
    expect(response.requests_total).toBe(0);
  });

  it('rejects telemetry for non-admin users', () => {
    expect(() =>
      controller.getCutoutTelemetry({
        user: {
          role: 'user',
        },
      } as never),
    ).toThrow(ForbiddenException);
  });
});
