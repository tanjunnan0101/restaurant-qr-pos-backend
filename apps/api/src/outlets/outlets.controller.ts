import { Body, Controller, Get, Ip, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { OutletsService } from './outlets.service';

@ApiTags('Outlets')
@ApiBearerAuth()
@Controller('admin/outlets')
export class OutletsController {
  constructor(private readonly outlets: OutletsService) {}

  @Get()
  @Permissions('outlet.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.outlets.list(user);
  }

  @Post()
  @Permissions('outlet.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOutletDto) {
    return this.outlets.create(user, dto);
  }

  @Patch(':outletId')
  @Permissions('outlet.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.outlets.update(user, outletId, dto, request.id, ipAddress);
  }
}
