import { Body, Controller, Get, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  RotateTableQrDto,
  SetupDiningTablesDto,
  UpdateDiningTableStatusDto,
} from './dto/table-setup.dto';
import { ResolveServiceRequestDto as ResolveTableServiceRequestDto } from './dto/service-request.dto';
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

  @Post(':tableId/status')
  @Permissions('table.manage')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('tableId') tableId: string,
    @Body() dto: UpdateDiningTableStatusDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.tables.updateStatus(
      user,
      outletId,
      tableId,
      dto.status,
      dto.reason,
      request.id,
      ipAddress,
    );
  }

  @Post(':tableId/service-requests/:requestId/resolve')
  @Permissions('order.manage')
  resolveServiceRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('tableId') tableId: string,
    @Param('requestId') requestId: string,
    @Body() dto: ResolveTableServiceRequestDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.tables.resolveServiceRequest(
      user,
      outletId,
      tableId,
      requestId,
      dto.note,
      request.id,
      ipAddress,
    );
  }
}
