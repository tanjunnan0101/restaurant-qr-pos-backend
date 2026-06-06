import { Module } from '@nestjs/common';
import { OperationsGateway } from './operations.gateway';

@Module({
  providers: [OperationsGateway],
  exports: [OperationsGateway],
})
export class RealtimeModule {}
