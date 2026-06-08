import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { PrismaService } from '../database/prisma.service';
import { CompaniesService } from './companies.service';

function createService() {
  const prisma = {
    company: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaService;

  return {
    service: new CompaniesService(prisma),
    prisma,
  };
}

describe('CompaniesService', () => {
  it('updates company settings and writes an audit log', async () => {
    const { service, prisma } = createService();
    const actor: AuthenticatedUser = {
      userId: 'user-1',
      companyId: 'company-1',
      email: 'owner@example.com',
    };

    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      id: 'company-1',
      slug: 'demo-restaurant',
      name: 'Demo Restaurant',
      legalName: 'Demo Restaurant Pte Ltd',
      registrationNumber: '202600123M',
      defaultCurrency: 'SGD',
      defaultTimezone: 'Asia/Singapore',
      status: 'ACTIVE',
    } as never);

    const companyUpdate = vi.fn().mockResolvedValue({
      id: 'company-1',
      slug: 'demo-restaurant',
      name: 'Demo Bistro',
      legalName: 'Demo Bistro Pte Ltd',
      registrationNumber: '202600123M',
      defaultCurrency: 'SGD',
      defaultTimezone: 'Asia/Singapore',
      status: 'ACTIVE',
    });
    const auditCreate = vi.fn().mockResolvedValue({});

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        company: {
          update: companyUpdate,
        },
        auditLog: {
          create: auditCreate,
        },
      } as never),
    );

    const result = await service.updateCurrent(
      actor,
      {
        name: 'Demo Bistro',
        legalName: 'Demo Bistro Pte Ltd',
        defaultCurrency: 'SGD',
        defaultTimezone: 'Asia/Singapore',
        reason: 'Refreshed business profile.',
      },
      'request-1',
      '127.0.0.1',
    );

    expect(companyUpdate).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          actorUserId: 'user-1',
          actionType: 'COMPANY_UPDATED',
          reason: 'Refreshed business profile.',
        }),
      }),
    );
    expect(result.name).toBe('Demo Bistro');
  });
});
