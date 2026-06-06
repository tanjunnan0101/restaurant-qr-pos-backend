import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '@restaurant-pos/db';

@Injectable()
export class PrismaService
  extends DatabaseClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super(config.getOrThrow<string>('DATABASE_URL'));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
