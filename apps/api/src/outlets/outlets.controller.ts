import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateOutletDto } from './dto/create-outlet.dto';
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
}
