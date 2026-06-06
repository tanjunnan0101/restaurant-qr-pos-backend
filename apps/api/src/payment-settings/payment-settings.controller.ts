import { Body, Controller, Get, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  DisablePaymentScopeDto,
  EnablePaymentScopeDto,
} from './dto/payment-control.dto';
import { PaymentSettingsService } from './payment-settings.service';

@ApiTags('Payment settings')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/payment-settings')
export class PaymentSettingsController {
  constructor(private readonly settings: PaymentSettingsService) {}

  @Get()
  @Permissions('payment.settings.read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.settings.get(user, outletId);
  }

  @Post('disable')
  @Permissions('payment.settings.manage')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: DisablePaymentScopeDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.settings.disable(user, outletId, dto, request.id, ipAddress);
  }

  @Post('enable')
  @Permissions('payment.settings.manage')
  enable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: EnablePaymentScopeDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.settings.enable(user, outletId, dto, request.id, ipAddress);
  }
}
