import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorTrackingService } from './error-tracking.service';

describe('ErrorTrackingService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does nothing when no webhook is configured', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const service = new ErrorTrackingService(
      new ConfigService({
        ERROR_TRACKING_ENABLED: true,
        ERROR_WEBHOOK_URL: '',
      }),
    );

    service.captureServerError({
      requestId: 'req-1',
      path: '/api/v1/public/qr/demo/token',
      method: 'GET',
      statusCode: 500,
      message: 'Internal server error',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts server errors to the configured webhook', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchSpy);
    const service = new ErrorTrackingService(
      new ConfigService({
        ERROR_TRACKING_ENABLED: true,
        ERROR_WEBHOOK_URL: 'https://alerts.example.com/webhook',
      }),
    );

    service.captureServerError({
      requestId: 'req-2',
      path: '/api/v1/admin/outlets',
      method: 'POST',
      statusCode: 500,
      message: 'Database failure',
      stack: 'stack trace',
    });

    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://alerts.example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
});
