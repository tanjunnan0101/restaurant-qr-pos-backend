import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { HitPayGateway } from './hitpay.gateway';
import { HitPayWebhookController } from './hitpay-webhook.controller';
import { PaymentsService } from './payments.service';
import { PublicPaymentsController } from './public-payments.controller';
import { PublicPaymentStatusController } from './public-payment-status.controller';

@Module({
  imports: [OrdersModule, RealtimeModule, TenantModule],
  controllers: [
    PublicPaymentsController,
    PublicPaymentStatusController,
    AdminPaymentsController,
    HitPayWebhookController,
  ],
  providers: [HitPayGateway, PaymentsService],
})
export class PaymentsModule {}
