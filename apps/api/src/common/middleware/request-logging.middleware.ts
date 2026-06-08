import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { resolveRequestClientIp } from './request-client.util';

type LoggedRequest = Request & { id?: string };

const EXEMPT_LOG_PATH_PREFIXES = ['/api/v1/health'];

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly enabled: boolean;
  private readonly trustProxy: boolean;
  private readonly slowRequestMs: number;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('REQUEST_LOGGING_ENABLED') ?? true;
    this.trustProxy = this.config.get<boolean>('API_TRUST_PROXY') ?? true;
    this.slowRequestMs =
      this.config.get<number>('REQUEST_LOGGING_SLOW_MS') ?? 1500;
  }

  use(request: LoggedRequest, response: Response, next: NextFunction): void {
    if (
      !this.enabled ||
      EXEMPT_LOG_PATH_PREFIXES.some((prefix) =>
        request.originalUrl.startsWith(prefix),
      )
    ) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const payload = {
        requestId: request.id ?? 'unknown',
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs),
        ip: resolveRequestClientIp(request, this.trustProxy),
        userAgent: truncateUserAgent(request.header('user-agent')),
      };

      if (response.statusCode >= 500) {
        console.error('[RequestLoggingMiddleware] Request failed', payload);
        return;
      }

      if (response.statusCode >= 400 || durationMs >= this.slowRequestMs) {
        console.warn('[RequestLoggingMiddleware] Request warning', payload);
        return;
      }

      console.log('[RequestLoggingMiddleware] Request completed', payload);
    });

    next();
  }
}

function truncateUserAgent(userAgent?: string): string | undefined {
  if (!userAgent) {
    return undefined;
  }

  return userAgent.slice(0, 200);
}
