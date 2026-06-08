import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { resolveRequestClientIp } from './request-client.util';

interface RateLimitPolicy {
  name: 'auth' | 'public' | 'admin';
  windowMs: number;
  maxRequests: number;
}

type RateLimitedRequest = Request & { id?: string };

const EXEMPT_PATH_PREFIXES = [
  '/api/v1/health',
  '/api/v1/webhooks/hitpay',
  '/api/v1/printer-agent',
  '/docs',
];

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, number[]>();
  private readonly enabled: boolean;
  private readonly trustProxy: boolean;
  private readonly policies: Record<RateLimitPolicy['name'], RateLimitPolicy>;
  private mutationCount = 0;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('RATE_LIMIT_ENABLED') ?? true;
    this.trustProxy = this.config.get<boolean>('API_TRUST_PROXY') ?? true;
    this.policies = {
      auth: {
        name: 'auth',
        windowMs:
          this.config.get<number>('RATE_LIMIT_AUTH_WINDOW_MS') ?? 300_000,
        maxRequests: this.config.get<number>('RATE_LIMIT_AUTH_MAX') ?? 20,
      },
      public: {
        name: 'public',
        windowMs:
          this.config.get<number>('RATE_LIMIT_PUBLIC_WINDOW_MS') ?? 60_000,
        maxRequests: this.config.get<number>('RATE_LIMIT_PUBLIC_MAX') ?? 120,
      },
      admin: {
        name: 'admin',
        windowMs:
          this.config.get<number>('RATE_LIMIT_ADMIN_WINDOW_MS') ?? 60_000,
        maxRequests: this.config.get<number>('RATE_LIMIT_ADMIN_MAX') ?? 300,
      },
    };
  }

  use(
    request: RateLimitedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    if (!this.enabled) {
      next();
      return;
    }

    const policy = this.resolvePolicy(request.originalUrl);
    if (!policy) {
      next();
      return;
    }

    const now = Date.now();
    const clientId = resolveRequestClientIp(request, this.trustProxy);
    const bucketKey = `${policy.name}:${clientId}`;
    const activeTimestamps = (this.buckets.get(bucketKey) ?? []).filter(
      (timestamp) => now - timestamp < policy.windowMs,
    );
    const resetSeconds = this.getResetSeconds(now, activeTimestamps, policy);

    if (activeTimestamps.length >= policy.maxRequests) {
      this.setRateLimitHeaders(
        response,
        policy.maxRequests,
        0,
        resetSeconds,
        resetSeconds,
      );
      console.warn('[RateLimitMiddleware] Rate limit exceeded', {
        requestId: request.id ?? 'unknown',
        path: request.originalUrl,
        method: request.method,
        clientId,
        policy: policy.name,
      });
      response.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please retry shortly.',
          request_id: request.id ?? 'unknown',
        },
      });
      return;
    }

    activeTimestamps.push(now);
    this.buckets.set(bucketKey, activeTimestamps);
    this.setRateLimitHeaders(
      response,
      policy.maxRequests,
      Math.max(policy.maxRequests - activeTimestamps.length, 0),
      resetSeconds,
    );
    this.mutationCount += 1;
    if (this.mutationCount % 200 === 0) {
      this.compactBuckets(now);
    }
    next();
  }

  private resolvePolicy(path: string): RateLimitPolicy | null {
    if (EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return null;
    }
    if (path.startsWith('/api/v1/auth/')) {
      return this.policies.auth;
    }
    if (path.startsWith('/api/v1/public/')) {
      return this.policies.public;
    }
    return this.policies.admin;
  }

  private setRateLimitHeaders(
    response: Response,
    limit: number,
    remaining: number,
    resetSeconds: number,
    retryAfterSeconds?: number,
  ): void {
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(resetSeconds));
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(resetSeconds));
    if (retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }
  }

  private getResetSeconds(
    now: number,
    activeTimestamps: number[],
    policy: RateLimitPolicy,
  ): number {
    if (activeTimestamps.length === 0) {
      return Math.max(1, Math.ceil(policy.windowMs / 1000));
    }

    return Math.max(
      1,
      Math.ceil((policy.windowMs - (now - activeTimestamps[0]!)) / 1000),
    );
  }

  private compactBuckets(now: number): void {
    for (const [bucketKey, timestamps] of this.buckets.entries()) {
      const policyName = bucketKey.split(':', 1)[0] as RateLimitPolicy['name'];
      const policy = this.policies[policyName];
      if (!policy) {
        this.buckets.delete(bucketKey);
        continue;
      }
      const activeTimestamps = timestamps.filter(
        (timestamp) => now - timestamp < policy.windowMs,
      );
      if (activeTimestamps.length === 0) {
        this.buckets.delete(bucketKey);
        continue;
      }
      this.buckets.set(bucketKey, activeTimestamps);
    }
  }
}
