import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrinterAgent } from '../types/authenticated-printer-agent';

export const CurrentPrinterAgent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrinterAgent => {
    const request = context.switchToHttp().getRequest<{
      printerAgent: AuthenticatedPrinterAgent;
    }>();
    return request.printerAgent;
  },
);
