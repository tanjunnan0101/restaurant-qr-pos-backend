import { Body, Controller, Get, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { RotateTableQrDto, SetupDiningTablesDto } from './dto/table-setup.dto';
import { TablesService } from './tables.service';

@ApiTags('Dining tables')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @Permissions('table.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.tables.list(user, outletId);
  }

  @Post('setup')
  @Permissions('table.manage', 'qr.manage')
  setup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: SetupDiningTablesDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.tables.setup(user, outletId, dto, request.id, ipAddress);
  }

  @Post(':tableId/qr/rotate')
  @Permissions('qr.manage')
  rotateQr(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('tableId') tableId: string,
    @Body() dto: RotateTableQrDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.tables.rotateQr(
      user,
      outletId,
      tableId,
      dto.reason,
      request.id,
      ipAddress,
    );
  }
}
