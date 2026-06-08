import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { HitPayGateway } from './hitpay.gateway';
import { HitPayWebhookController } from './hitpay-webhook.controller';
import { PaymentsService } from './payments.service';
import { PublicPaymentsController } from './public-payments.controller';

@Module({
  imports: [OrdersModule, RealtimeModule, TenantModule],
  controllers: [
    PublicPaymentsController,
    AdminPaymentsController,
    HitPayWebhookController,
  ],
  providers: [HitPayGateway, PaymentsService],
})
export class PaymentsModule {}
