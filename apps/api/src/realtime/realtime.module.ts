import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OperationsGateway } from './operations.gateway';

@Module({
  imports: [AuthModule],
  providers: [OperationsGateway],
  exports: [OperationsGateway],
})
export class RealtimeModule {}
