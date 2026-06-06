import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { verifyPrinterAgentToken } from '../printer-agent-token';
import type { AuthenticatedPrinterAgent } from '../types/authenticated-printer-agent';

@Injectable()
export class PrinterAgentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      printerAgent?: AuthenticatedPrinterAgent;
    }>();
    const agentId = this.header(request.headers['x-printer-agent-id']);
    const token = this.header(request.headers['x-printer-agent-key']);
    if (!agentId || !token) {
      throw new UnauthorizedException(
        'Printer agent credentials are required.',
      );
    }

    const agent = await this.prisma.printerAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent || !agent.active) {
      throw new ForbiddenException('Printer agent is disabled.');
    }
    if (!verifyPrinterAgentToken(token, agent.tokenHash)) {
      throw new UnauthorizedException('Printer agent credentials are invalid.');
    }

    request.printerAgent = {
      id: agent.id,
      companyId: agent.companyId,
      outletId: agent.outletId,
      deviceId: agent.deviceId,
    };
    return true;
  }

  private header(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
