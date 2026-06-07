import { ConflictException, Injectable } from '@nestjs/common';
import { PaymentMethod, type Prisma } from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import type { CreateOutletDto } from './dto/create-outlet.dto';

@Injectable()
export class OutletsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.outlet.findMany({
      where: {
        companyId: user.companyId,
        userAccess: { some: { userId: user.userId } },
        status: { not: 'ARCHIVED' },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        currency: true,
        gstEnabled: true,
        gstRateBps: true,
        serviceChargeEnabled: true,
        serviceChargeBps: true,
        status: true,
      },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateOutletDto) {
    const existing = await this.prisma.outlet.findUnique({
      where: {
        companyId_slug: {
          companyId: user.companyId,
          slug: dto.slug,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Outlet slug already exists.');
    }

    return this.prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.create({
        data: {
          companyId: user.companyId,
          name: dto.name,
          slug: dto.slug,
          timezone: dto.timezone,
          currency: dto.currency,
          gstEnabled: dto.gstEnabled,
          gstRateBps: dto.gstRateBps,
          serviceChargeEnabled: dto.serviceChargeEnabled,
          serviceChargeBps: dto.serviceChargeBps,
        },
      });

      await tx.outletPaymentControl.create({
        data: {
          companyId: user.companyId,
          outletId: outlet.id,
          updatedByUserId: user.userId,
        },
      });

      await tx.paymentMethodSetting.createMany({
        data: Object.values(PaymentMethod).map((method) => ({
          companyId: user.companyId,
          outletId: outlet.id,
          method,
          enabled: method === PaymentMethod.ONLINE_CARD,
          updatedByUserId: user.userId,
        })),
      });

      const ownerRole = await tx.role.findFirst({
        where: {
          companyId: user.companyId,
          systemKey: 'OWNER',
        },
        select: { id: true },
      });
      if (ownerRole) {
        await tx.userOutletAccess.create({
          data: {
            companyId: user.companyId,
            userId: user.userId,
            outletId: outlet.id,
            roleId: ownerRole.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId: outlet.id,
          actorUserId: user.userId,
          actionType: 'OUTLET_CREATED',
          entityType: 'outlet',
          entityId: outlet.id,
          afterJson: outlet as unknown as Prisma.InputJsonValue,
          reason: 'Outlet created through administration API.',
        },
      });

      return outlet;
    });
  }
}
