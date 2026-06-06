import {
  Body,
  Controller,
  Headers,
  Ip,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CreateStripeCheckoutDto } from './dto/create-stripe-checkout.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Public payments')
@Public()
@Controller('public/qr/:publicCode/:token/orders/:orderId/payment')
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createCheckout(
    @Param('publicCode') publicCode: string,
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateStripeCheckoutDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.payments.createCheckout(
      publicCode,
      token,
      orderId,
      idempotencyKey ?? '',
      dto,
      request.id,
      ipAddress,
    );
  }
}
