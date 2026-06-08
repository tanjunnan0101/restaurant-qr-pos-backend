import { Body, Controller, Get, Ip, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateCompanyDto } from './dto/update-company.dto';
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

  @Patch()
  @Permissions('company.manage')
  updateCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.companies.updateCurrent(
      user,
      dto,
      request.id,
      ipAddress,
    );
  }
}
