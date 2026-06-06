import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { MenusController } from './menus.controller';
import { MenusService } from './menus.service';

@Module({
  imports: [TenantModule],
  controllers: [MenusController],
  providers: [MenusService],
})
export class MenusModule {}
