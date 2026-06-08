import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorTrackingService } from '../observability/error-tracking.service';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorTracking: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { id?: string }>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const errorMessage =
      exception instanceof Error ? exception.message : 'Internal server error';
    const errorStack = exception instanceof Error ? exception.stack : undefined;
    const requestId = request.id ?? 'unknown';

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : typeof exceptionResponse === 'object' &&
            exceptionResponse !== null &&
            'message' in exceptionResponse
          ? exceptionResponse.message
          : errorMessage;

    if (!(exception instanceof HttpException)) {
      console.error('[ApiExceptionFilter] Unhandled exception', {
        requestId,
        path: request.originalUrl,
        method: request.method,
        message: errorMessage,
        stack: errorStack,
      });
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.errorTracking.captureServerError({
        requestId,
        path: request.originalUrl,
        method: request.method,
        statusCode: status,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        stack: errorStack,
      });
    }

    response.status(status).json({
      error: {
        code:
          exception instanceof HttpException
            ? exception.name.replace(/Exception$/, '').toUpperCase()
            : 'INTERNAL_SERVER_ERROR',
        message,
        request_id: requestId,
      },
    });
  }
}
