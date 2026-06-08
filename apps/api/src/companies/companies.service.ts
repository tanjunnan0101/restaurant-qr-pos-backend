import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import type { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        slug: true,
        name: true,
        legalName: true,
        registrationNumber: true,
        defaultCurrency: true,
        defaultTimezone: true,
        status: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company;
  }

  async updateCurrent(
    user: AuthenticatedUser,
    dto: UpdateCompanyDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        slug: true,
        name: true,
        legalName: true,
        registrationNumber: true,
        defaultCurrency: true,
        defaultTimezone: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Company not found.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: user.companyId },
        data: {
          name: dto.name ?? undefined,
          legalName: dto.legalName ?? undefined,
          registrationNumber: dto.registrationNumber ?? undefined,
          defaultCurrency: dto.defaultCurrency ?? undefined,
          defaultTimezone: dto.defaultTimezone ?? undefined,
        },
        select: {
          id: true,
          slug: true,
          name: true,
          legalName: true,
          registrationNumber: true,
          defaultCurrency: true,
          defaultTimezone: true,
          status: true,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorUserId: user.userId,
          actionType: 'COMPANY_UPDATED',
          entityType: 'company',
          entityId: user.companyId,
          reason: dto.reason,
          beforeJson: existing as Prisma.InputJsonValue,
          afterJson: company as Prisma.InputJsonValue,
          requestId,
          ipAddress,
        },
      });

      return company;
    });

    return updated;
  }
}
