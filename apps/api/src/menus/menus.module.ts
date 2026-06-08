import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { TenantModule } from '../tenant/tenant.module';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

@Module({
  imports: [TenantModule, RealtimeModule],
  controllers: [MenusController],
  providers: [MenusService],
})
export class MenusModule {}
