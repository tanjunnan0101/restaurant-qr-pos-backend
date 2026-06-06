import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsService } from './payments.service';
import { PublicPaymentsController } from './public-payments.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeGateway } from './stripe.gateway';

@Module({
  imports: [OrdersModule, RealtimeModule],
  controllers: [PublicPaymentsController, StripeWebhookController],
  providers: [StripeGateway, PaymentsService],
})
export class PaymentsModule {}
