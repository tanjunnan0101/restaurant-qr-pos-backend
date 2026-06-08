import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MenuChannel,
  MenuStatus,
  MenuVersionStatus,
} from '@restaurant-pos/db';
import { PrismaService } from '../database/prisma.service';
import { evaluatePaymentAvailability } from '../payment-settings/payment-availability';
import { OperationsGateway } from '../realtime/operations.gateway';
import { verifyQrToken } from './qr-token';

function serviceRequests(client: unknown) {
  return (client as { serviceRequest: any }).serviceRequest;
}

@Injectable()
export class PublicQrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsGateway,
  ) {}

  async resolve(publicCode: string, token: string) {
    const qr = await this.resolveActiveQr(publicCode, token);

    const [menu, control, methods, activeServiceRequest] = await Promise.all([
      this.prisma.menu.findFirst({
        where: {
          companyId: qr.companyId,
          outletId: qr.outletId,
          status: MenuStatus.ACTIVE,
          channel: { in: [MenuChannel.QR, MenuChannel.BOTH] },
          versions: {
            some: { status: MenuVersionStatus.PUBLISHED },
          },
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: {
          versions: {
            where: { status: MenuVersionStatus.PUBLISHED },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: {
              categories: {
                where: { active: true },
                orderBy: { displayOrder: 'asc' },
                include: {
                  items: {
                    where: { active: true },
                    orderBy: { displayOrder: 'asc' },
                    include: {
                      variants: {
                        where: { active: true },
                        orderBy: { displayOrder: 'asc' },
                      },
                      itemModifierGroups: {
                        orderBy: { displayOrder: 'asc' },
                        include: {
                          modifierGroup: {
                            include: {
                              options: {
                                where: { active: true },
                                orderBy: { displayOrder: 'asc' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.outletPaymentControl.findUnique({
        where: { outletId: qr.outletId },
      }),
      this.prisma.paymentMethodSetting.findMany({
        where: { outletId: qr.outletId },
        orderBy: { method: 'asc' },
      }),
      serviceRequests(this.prisma).findFirst({
        where: {
          companyId: qr.companyId,
          outletId: qr.outletId,
          tableId: qr.tableId,
          type: 'CALL_STAFF',
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          note: true,
          requestedAt: true,
          acknowledgedAt: true,
        },
      }),
    ]);

    const paymentAvailability =
      control && methods.length > 0
        ? evaluatePaymentAvailability({
            online: {
              enabled: control.onlinePaymentsEnabled,
              disabledUntil: control.onlineDisabledUntil,
            },
            stripe: {
              enabled: control.stripePaymentsEnabled,
              disabledUntil: control.stripeDisabledUntil,
            },
            methods,
          })
        : {};

    return {
      outlet: {
        id: qr.outlet.id,
        name: qr.outlet.name,
        currency: qr.outlet.currency,
        timezone: qr.outlet.timezone,
        gstEnabled: qr.outlet.gstEnabled,
        gstRateBps: qr.outlet.gstRateBps,
        serviceChargeEnabled: qr.outlet.serviceChargeEnabled,
        serviceChargeBps: qr.outlet.serviceChargeBps,
      },
      table: {
        id: qr.table.id,
        code: qr.table.tableCode,
        name: qr.table.displayName,
        capacity: qr.table.capacity,
        zone: qr.table.zone.name,
      },
      menu: menu
        ? {
            id: menu.id,
            name: menu.name,
            slug: menu.slug,
            version: menu.versions[0] ?? null,
          }
        : null,
      paymentAvailability,
      activeServiceRequest: activeServiceRequest
        ? {
            id: activeServiceRequest.id,
            type: activeServiceRequest.type,
            status: activeServiceRequest.status,
            note: activeServiceRequest.note,
            requestedAt: activeServiceRequest.requestedAt,
            acknowledgedAt: activeServiceRequest.acknowledgedAt,
          }
        : null,
    };
  }

  async requestHelp(
    publicCode: string,
    token: string,
    note?: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    const qr = await this.resolveActiveQr(publicCode, token);
    const normalizedNote = note?.trim() || 'Guest requested help from the QR menu.';

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await serviceRequests(tx).findFirst({
        where: {
          companyId: qr.companyId,
          outletId: qr.outletId,
          tableId: qr.tableId,
          type: 'CALL_STAFF',
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
        orderBy: { requestedAt: 'desc' },
      });
      if (existing) {
        return { request: existing, deduplicated: true };
      }

      const activeSession = await tx.tableSession.findUnique({
        where: { activeTableKey: qr.tableId },
        select: { id: true },
      });

      const created = await serviceRequests(tx).create({
        data: {
          companyId: qr.companyId,
          outletId: qr.outletId,
          tableId: qr.tableId,
          tableSessionId: activeSession?.id ?? null,
          qrCodeId: qr.id,
          type: 'CALL_STAFF',
          note: normalizedNote,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: qr.companyId,
          outletId: qr.outletId,
          entityType: 'service_request',
          entityId: created.id,
          actionType: 'SERVICE_REQUEST_CREATED',
          afterJson: {
            type: created.type,
            status: created.status,
            tableId: qr.tableId,
            qrCodeId: qr.id,
          },
          reason: normalizedNote,
          requestId,
          ipAddress,
        },
      });

      return { request: created, deduplicated: false };
    });

    if (!result.deduplicated) {
      this.operations.publishToOutlet(qr.outletId, 'service.request.created', {
        requestId: result.request.id,
        outletId: qr.outletId,
        tableId: qr.tableId,
        tableCode: qr.table.tableCode,
        tableName: qr.table.displayName,
        zoneName: qr.table.zone.name,
        type: result.request.type,
        status: result.request.status,
        note: result.request.note,
        requestedAt: result.request.requestedAt,
      });
    }

    return {
      request: {
        id: result.request.id,
        type: result.request.type,
        status: result.request.status,
        note: result.request.note,
        requestedAt: result.request.requestedAt,
      },
      deduplicated: result.deduplicated,
      message: result.deduplicated
        ? 'Help has already been requested for this table.'
        : 'A staff member has been notified for this table.',
    };
  }

  private async resolveActiveQr(publicCode: string, token: string) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode },
      include: {
        outlet: true,
        table: {
          include: { zone: true },
        },
      },
    });
    const valid =
      qr?.active &&
      (!qr.expiresAt || qr.expiresAt.getTime() > Date.now()) &&
      verifyQrToken(token, qr.tokenHash);
    if (
      !qr ||
      !valid ||
      !qr.table.active ||
      qr.table.status === 'OUT_OF_SERVICE'
    ) {
      throw new NotFoundException('QR code not found.');
    }

    return qr;
  }
}
