import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async listOutletAuditLogs(
    user: AuthenticatedUser,
    outletId: string,
    query?: {
      limit?: string;
      actionType?: string;
    },
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const take = clampLimit(query?.limit);
    const actionType = query?.actionType?.trim();

    const logs = await this.prisma.auditLog.findMany({
      where: {
        companyId: user.companyId,
        outletId,
        ...(actionType ? { actionType } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take,
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    return {
      entries: logs.map((log) => ({
        ...toAuditEntry(log),
        outlet: null,
      })),
    };
  }

  async listCompanyAuditLogs(
    user: AuthenticatedUser,
    query?: {
      limit?: string;
      actionType?: string;
      outletId?: string;
    },
  ) {
    const take = clampLimit(query?.limit);
    const actionType = query?.actionType?.trim();
    const outletId = query?.outletId?.trim();

    const logs = await this.prisma.auditLog.findMany({
      where: {
        companyId: user.companyId,
        ...(actionType ? { actionType } : {}),
        ...(outletId ? { outletId } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take,
      include: {
        actorUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        outlet: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return {
      entries: logs.map((log) => ({
        ...toAuditEntry(log),
        outlet: log.outlet
          ? {
              id: log.outlet.id,
              name: log.outlet.name,
              slug: log.outlet.slug,
            }
          : null,
      })),
    };
  }
}

function toAuditEntry(log: {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  requestId: string | null;
  ipAddress: string | null;
  createdAt: Date;
  beforeJson: unknown;
  afterJson: unknown;
  actorUser: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}) {
  return {
    id: log.id,
    actionType: log.actionType,
    entityType: log.entityType,
    entityId: log.entityId,
    reason: log.reason,
    requestId: log.requestId,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
    actor: log.actorUser
      ? {
          id: log.actorUser.id,
          fullName: log.actorUser.fullName,
          email: log.actorUser.email,
        }
      : null,
    before: log.beforeJson,
    after: log.afterJson,
  };
}

function clampLimit(limit?: string) {
  const parsed = Number.parseInt(limit ?? '50', 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.min(Math.max(parsed, 1), 100);
}
