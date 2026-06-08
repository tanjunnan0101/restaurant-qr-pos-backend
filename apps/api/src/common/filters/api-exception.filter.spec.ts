import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ErrorTrackingService } from '../observability/error-tracking.service';
import { ApiExceptionFilter } from './api-exception.filter';

function createArgumentsHost(input?: {
  exceptionResponse?: unknown;
  request?: Partial<Request & { id?: string }>;
}) {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const request = {
    id: 'req-filter-123',
    method: 'GET',
    originalUrl: '/api/v1/public/qr/demo/token',
    ...input?.request,
  };

  return {
    response,
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as ArgumentsHost,
  };
}

describe('ApiExceptionFilter', () => {
  it('tracks unhandled server errors', () => {
    const errorTracking = {
      captureServerError: vi.fn(),
    } as unknown as ErrorTrackingService;
    const filter = new ApiExceptionFilter(errorTracking);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { host, response } = createArgumentsHost();

    filter.catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(errorTracking.captureServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-filter-123',
        statusCode: 500,
        message: 'boom',
      }),
    );
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('does not track non-server http exceptions', () => {
    const errorTracking = {
      captureServerError: vi.fn(),
    } as unknown as ErrorTrackingService;
    const filter = new ApiExceptionFilter(errorTracking);
    const { host, response } = createArgumentsHost();

    filter.catch(new HttpException('Forbidden', HttpStatus.FORBIDDEN), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(errorTracking.captureServerError).not.toHaveBeenCalled();
  });
});
