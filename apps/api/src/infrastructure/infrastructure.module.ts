import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redisOptionsFromUrl } from './redis-options';
import { RedisService } from './redis.service';

export const PRINT_JOBS_QUEUE = 'print-jobs';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisOptionsFromUrl(config.getOrThrow<string>('REDIS_URL')),
        prefix: 'restaurant-pos',
      }),
    }),
    BullModule.registerQueue({
      name: PRINT_JOBS_QUEUE,
      defaultJobOptions: {
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }),
  ],
  providers: [RedisService],
  exports: [BullModule, RedisService],
})
export class InfrastructureModule {}
