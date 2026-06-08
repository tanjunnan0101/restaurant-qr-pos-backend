import {
  Body,
  Controller,
  Headers,
  Ip,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Admin payments')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/orders/:orderId/payment')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Permissions('order.manage')
  createCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateCheckoutDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.payments.createAdminCheckout(
      user,
      outletId,
      orderId,
      idempotencyKey ?? '',
      dto,
      request.id,
      ipAddress,
    );
  }
}
