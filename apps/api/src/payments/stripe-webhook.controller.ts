import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('Stripe webhooks')
@Public()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiHeader({ name: 'Stripe-Signature', required: true })
  handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!request.rawBody || !signature) {
      return this.payments.handleStripeWebhook(
        request.rawBody ?? Buffer.alloc(0),
        signature ?? '',
      );
    }
    return this.payments.handleStripeWebhook(request.rawBody, signature);
  }
}
