import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOutlet(companyId: string, outletId: string): Promise<void> {
    const outlet = await this.prisma.outlet.findFirst({
      where: {
        id: outletId,
        companyId,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });

    if (!outlet) {
      throw new NotFoundException('Outlet not found.');
    }
  }
}
