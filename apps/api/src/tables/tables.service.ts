import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import type { SetupDiningTablesDto } from './dto/table-setup.dto';
import { createQrTokenMaterial } from './qr-token';

@Injectable()
export class TablesService {
  private readonly customerBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    config: ConfigService,
  ) {
    this.customerBaseUrl = config
      .getOrThrow<string>('CUSTOMER_APP_BASE_URL')
      .replace(/\/$/, '');
  }

  async list(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    return this.prisma.diningZone.findMany({
      where: {
        companyId: user.companyId,
        outletId,
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        tables: {
          orderBy: { tableCode: 'asc' },
          include: {
            qrCodes: {
              where: { active: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                publicCode: true,
                destinationPath: true,
                expiresAt: true,
                createdAt: true,
                rotatedAt: true,
              },
            },
          },
        },
      },
    });
  }

  async setup(
    user: AuthenticatedUser,
    outletId: string,
    dto: SetupDiningTablesDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    this.validateSetup(dto);

    const generated = await this.prisma.$transaction(async (tx) => {
      const qrResults: Array<{
        tableId: string;
        tableCode: string;
        publicCode: string;
        qrUrl: string | null;
        generated: boolean;
      }> = [];

      for (const zoneDto of dto.zones) {
        const zone = await tx.diningZone.upsert({
          where: {
            outletId_name: {
              outletId,
              name: zoneDto.name.trim(),
            },
          },
          update: {
            displayOrder: zoneDto.displayOrder,
            active: zoneDto.active,
          },
          create: {
            companyId: user.companyId,
            outletId,
            name: zoneDto.name.trim(),
            displayOrder: zoneDto.displayOrder,
            active: zoneDto.active,
          },
        });

        for (const tableDto of zoneDto.tables) {
          const tableCode = tableDto.tableCode.toUpperCase();
          const table = await tx.diningTable.upsert({
            where: {
              outletId_tableCode: {
                outletId,
                tableCode,
              },
            },
            update: {
              zoneId: zone.id,
              displayName: tableDto.displayName.trim(),
              capacity: tableDto.capacity,
              shape: tableDto.shape,
              status: tableDto.status,
              active: tableDto.active,
            },
            create: {
              companyId: user.companyId,
              outletId,
              zoneId: zone.id,
              tableCode,
              displayName: tableDto.displayName.trim(),
              capacity: tableDto.capacity,
              shape: tableDto.shape,
              status: tableDto.status,
              active: tableDto.active,
            },
          });

          const activeQr = await tx.qrCode.findFirst({
            where: { tableId: table.id, active: true },
            orderBy: { createdAt: 'desc' },
          });
          if (!activeQr || dto.rotateExistingQr) {
            if (activeQr) {
              await tx.qrCode.updateMany({
                where: { tableId: table.id, active: true },
                data: { active: false, rotatedAt: new Date() },
              });
            }
            const qr = await this.createQr(tx, {
              companyId: user.companyId,
              outletId,
              tableId: table.id,
            });
            qrResults.push({
              tableId: table.id,
              tableCode,
              publicCode: qr.publicCode,
              qrUrl: qr.url,
              generated: true,
            });
          } else {
            qrResults.push({
              tableId: table.id,
              tableCode,
              publicCode: activeQr.publicCode,
              qrUrl: null,
              generated: false,
            });
          }
        }
      }

      await tx.clientOnboarding.updateMany({
        where: {
          companyId: user.companyId,
          tablesConfiguredAt: null,
        },
        data: { tablesConfiguredAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'DINING_TABLES_CONFIGURED',
          entityType: 'outlet',
          entityId: outletId,
          afterJson: {
            zoneCount: dto.zones.length,
            tableCount: qrResults.length,
            qrCodesGenerated: qrResults.filter((result) => result.generated)
              .length,
            existingQrCodesRotated: Boolean(dto.rotateExistingQr),
          },
          reason: 'Dining zones, tables, and QR codes configured in bulk.',
          requestId,
          ipAddress,
        },
      });

      return qrResults;
    });

    return {
      zones: await this.list(user, outletId),
      qrCodes: generated,
      note: 'QR URLs are returned only when generated. Rotate a code to receive a new URL.',
    };
  }

  async rotateQr(
    user: AuthenticatedUser,
    outletId: string,
    tableId: string,
    reason: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    const result = await this.prisma.$transaction(async (tx) => {
      const table = await tx.diningTable.findFirst({
        where: {
          id: tableId,
          companyId: user.companyId,
          outletId,
        },
      });
      if (!table) {
        throw new NotFoundException('Dining table not found.');
      }

      await tx.qrCode.updateMany({
        where: { tableId, active: true },
        data: { active: false, rotatedAt: new Date() },
      });
      const qr = await this.createQr(tx, {
        companyId: user.companyId,
        outletId,
        tableId,
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'TABLE_QR_ROTATED',
          entityType: 'dining_table',
          entityId: tableId,
          afterJson: { publicCode: qr.publicCode },
          reason,
          requestId,
          ipAddress,
        },
      });

      return qr;
    });

    return {
      tableId,
      publicCode: result.publicCode,
      qrUrl: result.url,
      note: 'Store or print this URL now. Its secret token cannot be retrieved later.',
    };
  }

  private validateSetup(dto: SetupDiningTablesDto): void {
    const zoneNames = dto.zones.map(({ name }) => name.trim().toLowerCase());
    if (new Set(zoneNames).size !== zoneNames.length) {
      throw new BadRequestException('Dining zone names must be unique.');
    }

    const tableCodes = dto.zones.flatMap(({ tables }) =>
      tables.map(({ tableCode }) => tableCode.toUpperCase()),
    );
    if (new Set(tableCodes).size !== tableCodes.length) {
      throw new BadRequestException(
        'Table codes must be unique across the outlet.',
      );
    }
  }

  private async createQr(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      outletId: string;
      tableId: string;
    },
  ) {
    const material = createQrTokenMaterial();
    const destinationPath = `/q/${material.publicCode}`;
    await tx.qrCode.create({
      data: {
        ...input,
        publicCode: material.publicCode,
        tokenHash: material.tokenHash,
        destinationPath,
      },
    });
    return {
      publicCode: material.publicCode,
      url: `${this.customerBaseUrl}${destinationPath}/${material.token}`,
    };
  }
}
