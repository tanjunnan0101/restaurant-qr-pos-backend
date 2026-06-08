import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestLoggingMiddleware } from './request-logging.middleware';

function createConfigService(
  overrides?: Record<string, unknown>,
): ConfigService {
  return new ConfigService({
    REQUEST_LOGGING_ENABLED: true,
    REQUEST_LOGGING_SLOW_MS: 500,
    API_TRUST_PROXY: true,
    ...overrides,
  });
}

function createRequest(input: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  ip?: string;
}) {
  const requestHeaders = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  );

  return {
    id: 'req-log-123',
    method: input.method ?? 'GET',
    originalUrl: input.path,
    ip: input.ip ?? '127.0.0.1',
    socket: {
      remoteAddress: input.ip ?? '127.0.0.1',
    },
    header: (name: string) => requestHeaders[name.toLowerCase()],
  } as Parameters<RequestLoggingMiddleware['use']>[0];
}

function createResponse(statusCode = 200) {
  const emitter = new EventEmitter();
  const response = emitter as Response & EventEmitter;
  response.statusCode = statusCode;
  return response;
}

describe('RequestLoggingMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips health checks', () => {
    const middleware = new RequestLoggingMiddleware(createConfigService());
    const next = vi.fn() as NextFunction;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    middleware.use(
      createRequest({ path: '/api/v1/health' }),
      createResponse(),
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs successful requests at info level', () => {
    const middleware = new RequestLoggingMiddleware(createConfigService());
    const next = vi.fn() as NextFunction;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.hrtime, 'bigint')
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(300_000_000n);

    const response = createResponse(200);
    middleware.use(
      createRequest({
        path: '/api/v1/admin/outlets',
        headers: { 'x-forwarded-for': '203.0.113.20', 'user-agent': 'vitest' },
      }),
      response,
      next,
    );
    response.emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith(
      '[RequestLoggingMiddleware] Request completed',
      expect.objectContaining({
        requestId: 'req-log-123',
        statusCode: 200,
        ip: '203.0.113.20',
        userAgent: 'vitest',
      }),
    );
  });

  it('logs slow requests at warning level', () => {
    const middleware = new RequestLoggingMiddleware(createConfigService());
    const next = vi.fn() as NextFunction;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(process.hrtime, 'bigint')
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(800_000_000n);

    const response = createResponse(200);
    middleware.use(
      createRequest({ path: '/api/v1/public/qr/demo/token' }),
      response,
      next,
    );
    response.emit('finish');

    expect(warnSpy).toHaveBeenCalledWith(
      '[RequestLoggingMiddleware] Request warning',
      expect.objectContaining({
        statusCode: 200,
        durationMs: 800,
      }),
    );
  });

  it('logs server errors at error level', () => {
    const middleware = new RequestLoggingMiddleware(createConfigService());
    const next = vi.fn() as NextFunction;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.hrtime, 'bigint')
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(100_000_000n);

    const response = createResponse(500);
    middleware.use(
      createRequest({ path: '/api/v1/public/qr/demo/token' }),
      response,
      next,
    );
    response.emit('finish');

    expect(errorSpy).toHaveBeenCalledWith(
      '[RequestLoggingMiddleware] Request failed',
      expect.objectContaining({
        statusCode: 500,
      }),
    );
  });
});
