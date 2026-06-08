import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { TenantModule } from '../tenant/tenant.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TenantModule, RealtimeModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
