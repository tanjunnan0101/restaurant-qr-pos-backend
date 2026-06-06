import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: Request & { id?: string },
    response: Response,
    next: NextFunction,
  ): void {
    const header = request.header('x-request-id');
    request.id = header && header.length <= 100 ? header : randomUUID();
    response.setHeader('x-request-id', request.id);
    next();
  }
}
