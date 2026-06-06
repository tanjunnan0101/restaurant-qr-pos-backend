import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { PublicOrdersController } from './public-orders.controller';

@Module({
  imports: [TenantModule, RealtimeModule],
  controllers: [PublicOrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
