import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { PrismaService } from '../database/prisma.service';
import { OutletsService } from './outlets.service';

function createService() {
  const prisma = {
    outlet: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaService;

  return {
    service: new OutletsService(prisma),
    prisma,
  };
}

describe('OutletsService', () => {
  it('updates outlet settings and writes an audit log', async () => {
    const { service, prisma } = createService();
    const actor: AuthenticatedUser = {
      userId: 'user-1',
      companyId: 'company-1',
      email: 'owner@example.com',
    };

    vi.mocked(prisma.outlet.findFirst)
      .mockResolvedValueOnce({
        id: 'outlet-1',
        companyId: 'company-1',
        name: 'Main Outlet',
        slug: 'main-outlet',
        timezone: 'Asia/Singapore',
        currency: 'SGD',
        gstEnabled: true,
        gstRateBps: 900,
        serviceChargeEnabled: false,
        serviceChargeBps: 1000,
        status: 'ACTIVE',
      } as never)
      .mockResolvedValueOnce(null as never);

    const outletUpdate = vi.fn().mockResolvedValue({
      id: 'outlet-1',
      name: 'Marina Outlet',
      slug: 'marina-outlet',
      timezone: 'Asia/Singapore',
      currency: 'SGD',
      gstEnabled: true,
      gstRateBps: 900,
      serviceChargeEnabled: true,
      serviceChargeBps: 1000,
      status: 'ACTIVE',
    });
    const auditCreate = vi.fn().mockResolvedValue({});

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        outlet: {
          update: outletUpdate,
        },
        auditLog: {
          create: auditCreate,
        },
      } as never),
    );

    const result = await service.update(
      actor,
      'outlet-1',
      {
        name: 'Marina Outlet',
        slug: 'marina-outlet',
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
        reason: 'Updated outlet settings.',
      },
      'request-1',
      '127.0.0.1',
    );

    expect(outletUpdate).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: 'OUTLET_UPDATED',
          reason: 'Updated outlet settings.',
        }),
      }),
    );
    expect(result.slug).toBe('marina-outlet');
  });
});
