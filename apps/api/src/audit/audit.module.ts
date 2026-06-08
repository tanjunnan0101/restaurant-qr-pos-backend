import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AuditController } from './audit.controller';
import { CompanyAuditController } from './company-audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [TenantModule],
  controllers: [AuditController, CompanyAuditController],
  providers: [AuditService],
})
export class AuditModule {}
