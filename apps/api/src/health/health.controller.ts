import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../infrastructure/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async getHealth(@Res({ passthrough: true }) response: Response): Promise<{
    status: 'ok' | 'degraded';
    timestamp: string;
    dependencies: {
      database: 'up' | 'down';
      redis: 'up' | 'down';
    };
  }> {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);
    const healthy =
      database.status === 'fulfilled' && redis.status === 'fulfilled';

    response.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: database.status === 'fulfilled' ? 'up' : 'down',
        redis: redis.status === 'fulfilled' ? 'up' : 'down',
      },
    };
  }
}
