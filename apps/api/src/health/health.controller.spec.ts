import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import type { RedisService } from '../infrastructure/redis.service';
import { HealthController } from './health.controller';

function createSubject(input?: { databaseError?: Error; redisError?: Error }) {
  const prisma = {
    $queryRaw: input?.databaseError
      ? vi.fn().mockRejectedValue(input.databaseError)
      : vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  } as unknown as PrismaService;
  const redis = {
    client: {
      ping: input?.redisError
        ? vi.fn().mockRejectedValue(input.redisError)
        : vi.fn().mockResolvedValue('PONG'),
    },
  } as unknown as RedisService;
  const response = {
    status: vi.fn(),
  } as unknown as Response;

  return {
    controller: new HealthController(prisma, redis),
    response,
  };
}

describe('HealthController', () => {
  it('returns HTTP 200 when PostgreSQL and Redis are available', async () => {
    const { controller, response } = createSubject();

    const result = await controller.getHealth(response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(result.status).toBe('ok');
    expect(result.dependencies).toEqual({
      database: 'up',
      redis: 'up',
    });
  });

  it('returns HTTP 503 when a required dependency is unavailable', async () => {
    const { controller, response } = createSubject({
      redisError: new Error('Redis unavailable'),
    });

    const result = await controller.getHealth(response);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(result.status).toBe('degraded');
    expect(result.dependencies).toEqual({
      database: 'up',
      redis: 'down',
    });
  });
});
