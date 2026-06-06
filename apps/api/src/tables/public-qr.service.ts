import { Injectable, NotFoundException } from '@nestjs/common';
import { MenuChannel, MenuStatus, MenuVersionStatus } from '@restaurant-pos/db';
import { PrismaService } from '../database/prisma.service';
import { evaluatePaymentAvailability } from '../payment-settings/payment-availability';
import { verifyQrToken } from './qr-token';

@Injectable()
export class PublicQrService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(publicCode: string, token: string) {
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
    if (!qr || !valid || !qr.table.active) {
      throw new NotFoundException('QR code not found.');
    }

    const [menu, control, methods] = await Promise.all([
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
    };
  }
}
