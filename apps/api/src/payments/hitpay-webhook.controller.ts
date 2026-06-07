import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('HitPay webhooks')
@Public()
@Controller('webhooks/hitpay')
export class HitPayWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiHeader({ name: 'Hitpay-Signature', required: true })
  handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('hitpay-signature') signature: string | undefined,
    @Headers('hitpay-event-type') eventType: string | undefined,
    @Headers('hitpay-event-object') eventObject: string | undefined,
  ) {
    return this.payments.handleHitPayWebhook(
      request.rawBody ?? Buffer.alloc(0),
      signature ?? '',
      eventType,
      eventObject,
    );
  }
}
