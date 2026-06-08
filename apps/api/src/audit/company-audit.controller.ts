import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('admin/company/audit-logs')
export class CompanyAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permissions('company.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('actionType') actionType?: string,
    @Query('outletId') outletId?: string,
  ) {
    return this.audit.listCompanyAuditLogs(user, {
      limit,
      actionType,
      outletId,
    });
  }
}
