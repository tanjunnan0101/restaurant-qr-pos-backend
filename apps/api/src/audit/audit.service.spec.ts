import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { PrismaService } from '../database/prisma.service';
import type { TenantService } from '../tenant/tenant.service';
import { AuditService } from './audit.service';

function createService() {
  const prisma = {
    auditLog: {
      findMany: vi.fn(),
    },
  } as unknown as PrismaService;
  const tenant = {
    assertOutlet: vi.fn(),
  } as unknown as TenantService;

  return {
    service: new AuditService(prisma, tenant),
    prisma,
    tenant,
  };
}

describe('AuditService', () => {
  it('returns outlet audit entries in a UI-friendly shape', async () => {
    const { service, prisma, tenant } = createService();
    const actor: AuthenticatedUser = {
      userId: 'user-1',
      companyId: 'company-1',
      email: 'owner@example.com',
    };

    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'log-1',
        actionType: 'STAFF_ROLE_UPDATED',
        entityType: 'user_outlet_access',
        entityId: 'access-1',
        reason: 'Shift lead reassignment.',
        requestId: 'request-1',
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-06-08T09:00:00.000Z'),
        beforeJson: { role: 'CASHIER' },
        afterJson: { role: 'MANAGER' },
        actorUser: {
          id: 'user-1',
          fullName: 'Owner User',
          email: 'owner@example.com',
        },
      },
    ] as never);

    const result = await service.listOutletAuditLogs(actor, 'outlet-1', {
      limit: '25',
    });

    expect(tenant.assertOutlet).toHaveBeenCalledWith('company-1', 'outlet-1');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          outletId: 'outlet-1',
        }),
        take: 25,
      }),
    );
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        id: 'log-1',
        actionType: 'STAFF_ROLE_UPDATED',
        actor: expect.objectContaining({
          fullName: 'Owner User',
        }),
        before: { role: 'CASHIER' },
        after: { role: 'MANAGER' },
      }),
    );
  });

  it('returns company audit entries with outlet context', async () => {
    const { service, prisma } = createService();
    const actor: AuthenticatedUser = {
      userId: 'user-1',
      companyId: 'company-1',
      email: 'owner@example.com',
    };

    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'log-2',
        actionType: 'OUTLET_UPDATED',
        entityType: 'outlet',
        entityId: 'outlet-1',
        reason: 'Outlet timezone corrected.',
        requestId: 'request-2',
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-06-08T10:00:00.000Z'),
        beforeJson: { timezone: 'Asia/Tokyo' },
        afterJson: { timezone: 'Asia/Singapore' },
        actorUser: {
          id: 'user-1',
          fullName: 'Owner User',
          email: 'owner@example.com',
        },
        outlet: {
          id: 'outlet-1',
          name: 'Main Outlet',
          slug: 'main-outlet',
        },
      },
    ] as never);

    const result = await service.listCompanyAuditLogs(actor, {
      limit: '10',
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
        }),
        take: 10,
      }),
    );
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        actionType: 'OUTLET_UPDATED',
        outlet: expect.objectContaining({
          slug: 'main-outlet',
        }),
      }),
    );
  });
});
