import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PaymentSettingsController } from './payment-settings.controller';
import { PaymentSettingsService } from './payment-settings.service';

@Module({
  imports: [TenantModule],
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService],
  exports: [PaymentSettingsService],
})
export class PaymentSettingsModule {}
