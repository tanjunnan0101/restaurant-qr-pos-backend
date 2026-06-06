import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CompaniesService } from './companies.service';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('admin/company')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @Permissions('company.read')
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.companies.getCurrent(user.companyId);
  }
}
