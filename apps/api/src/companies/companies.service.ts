import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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
}
