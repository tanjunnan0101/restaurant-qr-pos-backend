import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { TenantModule } from '../tenant/tenant.module';
import { PrinterAgentController } from './printer-agent.controller';
import { PrinterAgentGuard } from './guards/printer-agent.guard';
import { PrintingController } from './printing.controller';
import { PrintingService } from './printing.service';

@Module({
  imports: [TenantModule, RealtimeModule],
  controllers: [PrintingController, PrinterAgentController],
  providers: [PrintingService, PrinterAgentGuard],
})
export class PrintingModule {}
