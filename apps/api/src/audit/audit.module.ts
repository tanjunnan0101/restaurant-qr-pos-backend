import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { CompanyAuditController } from './company-audit.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditController, CompanyAuditController],
  providers: [AuditService],
})
export class AuditModule {}
