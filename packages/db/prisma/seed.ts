import 'dotenv/config';
import { hash } from 'bcryptjs';
import { DatabaseClient, PaymentMethod, permissionCatalog } from '../src';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const prisma = new DatabaseClient(databaseUrl);

async function main(): Promise<void> {
  for (const permission of permissionCatalog) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        description: permission.description,
        category: permission.category,
      },
      create: permission,
    });
  }

  const company = await prisma.company.upsert({
    where: { slug: 'demo-restaurant' },
    update: {},
    create: {
      slug: 'demo-restaurant',
      name: 'Demo Restaurant Group',
      legalName: 'Demo Restaurant Group Pte. Ltd.',
    },
  });

  const outlet = await prisma.outlet.upsert({
    where: {
      companyId_slug: {
        companyId: company.id,
        slug: 'main-outlet',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: 'Main Outlet',
      slug: 'main-outlet',
      gstEnabled: true,
      gstRateBps: 900,
      serviceChargeEnabled: true,
      serviceChargeBps: 1000,
    },
  });

  const ownerEmail = (
    process.env.SEED_OWNER_EMAIL ?? 'owner@example.com'
  ).toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await hash(ownerPassword, 12);

  const owner = await prisma.user.upsert({
    where: {
      companyId_email: {
        companyId: company.id,
        email: ownerEmail,
      },
    },
    update: {
      passwordHash,
      fullName: 'Demo Owner',
    },
    create: {
      companyId: company.id,
      email: ownerEmail,
      fullName: 'Demo Owner',
      passwordHash,
    },
  });

  const role = await prisma.role.upsert({
    where: {
      companyId_systemKey: {
        companyId: company.id,
        systemKey: 'OWNER',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: 'Owner',
      systemKey: 'OWNER',
      description: 'Full tenant administration access.',
    },
  });

  const permissionRows = await prisma.permission.findMany({
    where: { key: { in: permissionCatalog.map(({ key }) => key) } },
  });

  await prisma.rolePermission.createMany({
    data: permissionRows.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  await prisma.userOutletAccess.upsert({
    where: {
      userId_outletId_roleId: {
        userId: owner.id,
        outletId: outlet.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      companyId: company.id,
      userId: owner.id,
      outletId: outlet.id,
      roleId: role.id,
    },
  });

  await prisma.outletPaymentControl.upsert({
    where: { outletId: outlet.id },
    update: {},
    create: {
      companyId: company.id,
      outletId: outlet.id,
      updatedByUserId: owner.id,
    },
  });

  for (const method of Object.values(PaymentMethod)) {
    await prisma.paymentMethodSetting.upsert({
      where: {
        outletId_method: {
          outletId: outlet.id,
          method,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        outletId: outlet.id,
        method,
        enabled: method === PaymentMethod.ONLINE_CARD,
        updatedByUserId: owner.id,
      },
    });
  }

  console.log(`Seeded company: ${company.slug}`);
  console.log(`Seeded outlet: ${outlet.slug} (${outlet.id})`);
  console.log(`Seeded owner: ${ownerEmail}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
