import { Body, Controller, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentPrinterAgent } from './decorators/current-printer-agent.decorator';
import {
  PrinterAgentHeartbeatDto,
  PrinterJobResultDto,
} from './dto/printer-agent.dto';
import { PrinterAgentGuard } from './guards/printer-agent.guard';
import { PrintingService } from './printing.service';
import type { AuthenticatedPrinterAgent } from './types/authenticated-printer-agent';

@ApiTags('Printer agent')
@ApiHeader({ name: 'x-printer-agent-id', required: true })
@ApiHeader({ name: 'x-printer-agent-key', required: true })
@Public()
@UseGuards(PrinterAgentGuard)
@Controller('printer-agent')
export class PrinterAgentController {
  constructor(private readonly printing: PrintingService) {}

  @Post('heartbeat')
  heartbeat(
    @CurrentPrinterAgent() agent: AuthenticatedPrinterAgent,
    @Body() dto: PrinterAgentHeartbeatDto,
    @Ip() ipAddress: string,
  ) {
    return this.printing.heartbeat(agent, dto.appVersion, ipAddress);
  }

  @Post('jobs/lease')
  lease(@CurrentPrinterAgent() agent: AuthenticatedPrinterAgent) {
    return this.printing.leaseNext(agent);
  }

  @Post('jobs/:printJobId/complete')
  complete(
    @CurrentPrinterAgent() agent: AuthenticatedPrinterAgent,
    @Param('printJobId') printJobId: string,
    @Body() dto: PrinterJobResultDto,
  ) {
    return this.printing.complete(agent, printJobId, dto.message);
  }

  @Post('jobs/:printJobId/fail')
  fail(
    @CurrentPrinterAgent() agent: AuthenticatedPrinterAgent,
    @Param('printJobId') printJobId: string,
    @Body() dto: PrinterJobResultDto,
  ) {
    return this.printing.fail(agent, printJobId, dto.message);
  }
}
