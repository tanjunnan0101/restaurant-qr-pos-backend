import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PublicQrController } from './public-qr.controller';
import { PublicQrService } from './public-qr.service';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [TenantModule],
  controllers: [TablesController, PublicQrController],
  providers: [TablesService, PublicQrService],
})
export class TablesModule {}
