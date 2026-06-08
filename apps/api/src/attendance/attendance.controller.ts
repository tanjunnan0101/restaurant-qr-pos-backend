import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AttendanceService } from './attendance.service';
import type {
  AdjustAttendanceSessionDto,
  ApproveAttendanceSessionDto,
  ClockAttendanceDto,
  ListAttendanceSessionsQueryDto,
  UpdateAttendanceSettingsDto,
} from './dto/attendance.dto';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('current')
  @Permissions('outlet.read')
  getCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.attendance.getCurrent(user, outletId);
  }

  @Post('clock-in')
  @Permissions('outlet.read')
  clockIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: ClockAttendanceDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.attendance.clockIn(user, outletId, dto, request.id, ipAddress);
  }

  @Post('clock-out')
  @Permissions('outlet.read')
  clockOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: ClockAttendanceDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.attendance.clockOut(user, outletId, dto, request.id, ipAddress);
  }

  @Get('sessions')
  @Permissions('user.manage')
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Query() query: ListAttendanceSessionsQueryDto,
  ) {
    return this.attendance.listSessions(user, outletId, query);
  }

  @Get('settings')
  @Permissions('user.manage')
  getSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.attendance.getSettings(user, outletId);
  }

  @Patch('settings')
  @Permissions('user.manage')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateAttendanceSettingsDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.attendance.updateSettings(
      user,
      outletId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post('sessions/:sessionId/approve')
  @Permissions('user.manage')
  approveSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ApproveAttendanceSessionDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.attendance.approveSession(
      user,
      outletId,
      sessionId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post('sessions/:sessionId/adjust')
  @Permissions('user.manage')
  adjustSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AdjustAttendanceSessionDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.attendance.adjustSession(
      user,
      outletId,
      sessionId,
      dto,
      request.id,
      ipAddress,
    );
  }
}
