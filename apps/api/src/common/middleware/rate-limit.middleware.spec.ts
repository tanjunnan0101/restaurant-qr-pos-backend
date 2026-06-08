import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitMiddleware } from './rate-limit.middleware';

type MutableHeaders = Record<string, string | undefined>;

function createConfigService(overrides?: Record<string, unknown>): ConfigService {
  return new ConfigService({
    RATE_LIMIT_ENABLED: true,
    API_TRUST_PROXY: true,
    RATE_LIMIT_AUTH_WINDOW_MS: 1000,
    RATE_LIMIT_AUTH_MAX: 2,
    RATE_LIMIT_PUBLIC_WINDOW_MS: 1000,
    RATE_LIMIT_PUBLIC_MAX: 3,
    RATE_LIMIT_ADMIN_WINDOW_MS: 1000,
    RATE_LIMIT_ADMIN_MAX: 5,
    ...overrides,
  });
}

function createResponse() {
  const headers: MutableHeaders = {};
  const response: {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  } = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };

  response.setHeader.mockImplementation((name: string, value: string) => {
    headers[name] = value;
    return response;
  });
  response.status.mockImplementation(() => response);
  response.json.mockImplementation(() => response);

  return {
    headers,
    response: response as unknown as Response,
  };
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
    id: 'req-123',
    method: input.method ?? 'GET',
    originalUrl: input.path,
    ip: input.ip ?? '127.0.0.1',
    socket: {
      remoteAddress: input.ip ?? '127.0.0.1',
    },
    header: (name: string) => requestHeaders[name.toLowerCase()],
  } as unknown as Parameters<RateLimitMiddleware['use']>[0];
}

describe('RateLimitMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips exempt routes entirely', () => {
    const middleware = new RateLimitMiddleware(createConfigService());
    const request = createRequest({
      path: '/api/v1/health',
      headers: { 'x-forwarded-for': '198.51.100.20' },
    });
    const { headers, response } = createResponse();
    const next = vi.fn() as NextFunction;

    middleware.use(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
    expect(headers['RateLimit-Limit']).toBeUndefined();
  });

  it('applies the auth policy and blocks after the configured threshold', () => {
    const middleware = new RateLimitMiddleware(createConfigService());
    const request = createRequest({
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.4' },
    });
    const next = vi.fn() as NextFunction;

    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const firstResponse = createResponse();
    middleware.use(request, firstResponse.response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(firstResponse.headers['RateLimit-Limit']).toBe('2');
    expect(firstResponse.headers['RateLimit-Remaining']).toBe('1');
    expect(firstResponse.headers['X-RateLimit-Remaining']).toBe('1');

    vi.spyOn(Date, 'now').mockReturnValue(1_500);
    const secondResponse = createResponse();
    middleware.use(request, secondResponse.response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(secondResponse.headers['RateLimit-Remaining']).toBe('0');

    vi.spyOn(Date, 'now').mockReturnValue(1_600);
    const blockedResponse = createResponse();
    middleware.use(request, blockedResponse.response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(blockedResponse.response.status).toHaveBeenCalledWith(429);
    expect(blockedResponse.response.json).toHaveBeenCalledWith({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please retry shortly.',
        request_id: 'req-123',
      },
    });
    expect(blockedResponse.headers['Retry-After']).toBe('1');
  });

  it('falls back to the socket address when proxy headers are disabled', () => {
    const middleware = new RateLimitMiddleware(
      createConfigService({
        API_TRUST_PROXY: false,
        RATE_LIMIT_PUBLIC_MAX: 1,
      }),
    );
    const next = vi.fn() as NextFunction;

    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    middleware.use(
      createRequest({
        path: '/api/v1/public/qr/demo/token',
        headers: { 'x-forwarded-for': '198.51.100.30' },
        ip: '10.10.10.10',
      }),
      createResponse().response,
      next,
    );

    vi.spyOn(Date, 'now').mockReturnValue(2_100);
    const blockedResponse = createResponse();
    middleware.use(
      createRequest({
        path: '/api/v1/public/qr/demo/token',
        headers: { 'x-forwarded-for': '203.0.113.41' },
        ip: '10.10.10.10',
      }),
      blockedResponse.response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(blockedResponse.response.status).toHaveBeenCalledWith(429);
  });
});
