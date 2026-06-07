import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  defaultRoleTemplates,
  OnboardingStatus,
  PaymentMethod,
  permissionCatalog,
  UserStatus,
  type Prisma,
} from '@restaurant-pos/db';
import { createActivationToken } from '../common/security/activation-token';
import { PrismaService } from '../database/prisma.service';
import type { CreateClientOnboardingDto } from './dto/create-client-onboarding.dto';
import { buildOnboardingChecklist } from './onboarding-checklist';

const onboardingInclude = {
  company: {
    include: {
      outlets: {
        orderBy: { createdAt: 'asc' as const },
        take: 1,
      },
    },
  },
  owner: true,
} satisfies Prisma.ClientOnboardingInclude;

type OnboardingRecord = Prisma.ClientOnboardingGetPayload<{
  include: typeof onboardingInclude;
}>;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PlatformOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createClient(
    dto: CreateClientOnboardingDto,
    idempotencyKey: string,
    operator: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    const normalizedKey = idempotencyKey.trim();
    if (!normalizedKey || normalizedKey.length > 120) {
      throw new BadRequestException(
        'A valid Idempotency-Key header is required.',
      );
    }

    const fingerprint = this.fingerprint(dto);
    const existing = await this.prisma.clientOnboarding.findUnique({
      where: { idempotencyKey: normalizedKey },
      include: onboardingInclude,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new ConflictException(
          'Idempotency key was already used for a different client.',
        );
      }
      return this.toResponse(existing, null, 'already_created');
    }

    const duplicateCompany = await this.prisma.company.findUnique({
      where: { slug: dto.companySlug },
      select: { id: true },
    });
    if (duplicateCompany) {
      throw new ConflictException('Company slug already exists.');
    }

    const activation = createActivationToken();
    const expiresAt = this.activationExpiry();
    const paymentDefaults = {
      onlinePaymentsEnabled: dto.payments?.onlinePaymentsEnabled ?? true,
      onlineCardEnabled: dto.payments?.onlineCardEnabled ?? true,
      manualPayNowEnabled: dto.payments?.manualPayNowEnabled ?? false,
    };

    let onboarding: OnboardingRecord;
    try {
      onboarding = await this.prisma.$transaction(async (tx) => {
        await this.upsertPermissionCatalog(tx);

        const company = await tx.company.create({
          data: {
            slug: dto.companySlug,
            name: dto.companyName,
            legalName: dto.legalName,
            registrationNumber: dto.registrationNumber,
            defaultCurrency: dto.currency ?? 'SGD',
            defaultTimezone: dto.timezone ?? 'Asia/Singapore',
          },
        });
        const outlet = await tx.outlet.create({
          data: {
            companyId: company.id,
            name: dto.outletName,
            slug: dto.outletSlug,
            address: dto.address,
            phone: dto.phone,
            timezone: dto.timezone ?? 'Asia/Singapore',
            currency: dto.currency ?? 'SGD',
            gstEnabled: dto.gstEnabled ?? true,
            gstRateBps: dto.gstRateBps ?? 900,
            serviceChargeEnabled: dto.serviceChargeEnabled ?? false,
            serviceChargeBps: dto.serviceChargeBps ?? 1000,
          },
        });

        const roles = await this.createDefaultRoles(tx, company.id);
        const ownerRoleId = roles.get('OWNER');
        if (!ownerRoleId) {
          throw new Error('Owner role provisioning failed.');
        }

        const owner = await tx.user.create({
          data: {
            companyId: company.id,
            email: dto.ownerEmail.toLowerCase(),
            fullName: dto.ownerFullName,
            passwordHash: null,
            status: UserStatus.PENDING_ACTIVATION,
          },
        });
        await tx.userOutletAccess.create({
          data: {
            companyId: company.id,
            userId: owner.id,
            outletId: outlet.id,
            roleId: ownerRoleId,
          },
        });

        await tx.outletPaymentControl.create({
          data: {
            companyId: company.id,
            outletId: outlet.id,
            onlinePaymentsEnabled: paymentDefaults.onlinePaymentsEnabled,
            stripePaymentsEnabled: true,
            updatedByUserId: owner.id,
          },
        });
        await tx.paymentMethodSetting.createMany({
          data: [
            {
              companyId: company.id,
              outletId: outlet.id,
              method: PaymentMethod.ONLINE_CARD,
              enabled: paymentDefaults.onlineCardEnabled,
              updatedByUserId: owner.id,
            },
            {
              companyId: company.id,
              outletId: outlet.id,
              method: PaymentMethod.STRIPE_PAYNOW,
              enabled: false,
              updatedByUserId: owner.id,
            },
            {
              companyId: company.id,
              outletId: outlet.id,
              method: PaymentMethod.MANUAL_PAYNOW,
              enabled: false,
              updatedByUserId: owner.id,
            },
          ],
        });

        await tx.userActivationToken.create({
          data: {
            userId: owner.id,
            tokenHash: activation.tokenHash,
            expiresAt,
          },
        });

        const created = await tx.clientOnboarding.create({
          data: {
            companyId: company.id,
            ownerUserId: owner.id,
            idempotencyKey: normalizedKey,
            requestFingerprint: fingerprint,
            status: OnboardingStatus.PENDING_OWNER_ACTIVATION,
            paymentMethodsSelectedAt: new Date(),
          },
          include: onboardingInclude,
        });

        await tx.auditLog.create({
          data: {
            companyId: company.id,
            outletId: outlet.id,
            actionType: 'CLIENT_ONBOARDED',
            entityType: 'company',
            entityId: company.id,
            afterJson: {
              companySlug: company.slug,
              ownerEmail: owner.email,
              outletSlug: outlet.slug,
              operator,
            },
            reason: `Client onboarding created by ${operator}.`,
            requestId,
            ipAddress,
          },
        });

        return created;
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const concurrent = await this.prisma.clientOnboarding.findUnique({
        where: { idempotencyKey: normalizedKey },
        include: onboardingInclude,
      });
      if (concurrent?.requestFingerprint === fingerprint) {
        return this.toResponse(concurrent, null, 'already_created');
      }
      throw new ConflictException(
        'Client already exists or the idempotency key was reused.',
      );
    }

    return this.toResponse(onboarding, activation.token, 'created', expiresAt);
  }

  async listClients() {
    const clients = await this.prisma.clientOnboarding.findMany({
      include: onboardingInclude,
      orderBy: { createdAt: 'desc' },
    });
    return {
      count: clients.length,
      clients: clients.map((client) =>
        this.toResponse(client, null, 'existing'),
      ),
    };
  }

  async getClient(companyId: string) {
    const client = await this.prisma.clientOnboarding.findUnique({
      where: { companyId },
      include: onboardingInclude,
    });
    if (!client) {
      throw new NotFoundException('Client onboarding record not found.');
    }
    return this.toResponse(client, null, 'existing');
  }

  async reissueActivation(
    companyId: string,
    operator: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    const client = await this.prisma.clientOnboarding.findUnique({
      where: { companyId },
      include: onboardingInclude,
    });
    if (!client) {
      throw new NotFoundException('Client onboarding record not found.');
    }
    if (client.owner.status === UserStatus.ACTIVE) {
      throw new ConflictException('Owner account is already active.');
    }

    const activation = createActivationToken();
    const expiresAt = this.activationExpiry();

    await this.prisma.$transaction(async (tx) => {
      await tx.userActivationToken.updateMany({
        where: {
          userId: client.ownerUserId,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      await tx.userActivationToken.create({
        data: {
          userId: client.ownerUserId,
          tokenHash: activation.tokenHash,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          outletId: client.company.outlets[0]?.id,
          actionType: 'OWNER_ACTIVATION_REISSUED',
          entityType: 'user',
          entityId: client.ownerUserId,
          reason: `Owner activation reissued by ${operator}.`,
          requestId,
          ipAddress,
        },
      });
    });

    return this.toResponse(
      client,
      activation.token,
      'activation_reissued',
      expiresAt,
    );
  }

  private async upsertPermissionCatalog(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const permission of permissionCatalog) {
      await tx.permission.upsert({
        where: { key: permission.key },
        update: {
          description: permission.description,
          category: permission.category,
        },
        create: permission,
      });
    }
  }

  private async createDefaultRoles(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<Map<string, string>> {
    const permissionRows = await tx.permission.findMany({
      where: {
        key: {
          in: permissionCatalog.map(({ key }) => key),
        },
      },
    });
    const permissionIds = new Map(
      permissionRows.map((permission) => [permission.key, permission.id]),
    );
    const roleIds = new Map<string, string>();

    for (const template of defaultRoleTemplates) {
      const role = await tx.role.create({
        data: {
          companyId,
          name: template.name,
          systemKey: template.systemKey,
          description: template.description,
        },
      });
      roleIds.set(template.systemKey, role.id);

      await tx.rolePermission.createMany({
        data: template.permissions.map((permissionKey) => {
          const permissionId = permissionIds.get(permissionKey);
          if (!permissionId) {
            throw new Error(`Permission ${permissionKey} was not provisioned.`);
          }
          return {
            roleId: role.id,
            permissionId,
          };
        }),
      });
    }
    return roleIds;
  }

  private fingerprint(dto: CreateClientOnboardingDto): string {
    const normalized = {
      companyName: dto.companyName,
      companySlug: dto.companySlug,
      legalName: dto.legalName ?? null,
      registrationNumber: dto.registrationNumber ?? null,
      ownerFullName: dto.ownerFullName,
      ownerEmail: dto.ownerEmail.toLowerCase(),
      outletName: dto.outletName,
      outletSlug: dto.outletSlug,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      timezone: dto.timezone ?? 'Asia/Singapore',
      currency: dto.currency ?? 'SGD',
      gstEnabled: dto.gstEnabled ?? true,
      gstRateBps: dto.gstRateBps ?? 900,
      serviceChargeEnabled: dto.serviceChargeEnabled ?? false,
      serviceChargeBps: dto.serviceChargeBps ?? 1000,
      payments: {
        onlinePaymentsEnabled: dto.payments?.onlinePaymentsEnabled ?? true,
        onlineCardEnabled: dto.payments?.onlineCardEnabled ?? true,
        manualPayNowEnabled: dto.payments?.manualPayNowEnabled ?? false,
      },
    };
    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  private activationExpiry(): Date {
    return new Date(
      Date.now() +
        this.config.getOrThrow<number>('ONBOARDING_TOKEN_TTL_HOURS') *
          60 *
          60 *
          1000,
    );
  }

  private toResponse(
    onboarding: OnboardingRecord,
    activationToken: string | null,
    result: string,
    activationExpiresAt?: Date,
  ) {
    const outlet = onboarding.company.outlets[0];
    const checklist = buildOnboardingChecklist(onboarding);
    const completedSteps = checklist.filter(
      ({ completed }) => completed,
    ).length;
    const ownerBaseUrl = this.config
      .getOrThrow<string>('OWNER_APP_BASE_URL')
      .replace(/\/$/, '');

    return {
      result,
      client: {
        company: {
          id: onboarding.company.id,
          name: onboarding.company.name,
          slug: onboarding.company.slug,
          status: onboarding.company.status,
        },
        owner: {
          id: onboarding.owner.id,
          fullName: onboarding.owner.fullName,
          email: onboarding.owner.email,
          status: onboarding.owner.status,
        },
        firstOutlet: outlet
          ? {
              id: outlet.id,
              name: outlet.name,
              slug: outlet.slug,
            }
          : null,
      },
      onboarding: {
        status: onboarding.status,
        completedSteps,
        totalSteps: checklist.length,
        checklist,
      },
      activation: activationToken
        ? {
            token: activationToken,
            expiresAt: activationExpiresAt,
            url: `${ownerBaseUrl}/activate?token=${encodeURIComponent(
              activationToken,
            )}&company=${encodeURIComponent(onboarding.company.slug)}`,
          }
        : {
            token: null,
            expiresAt: null,
            url: null,
            message:
              result === 'already_created'
                ? 'Client already exists. Reissue activation if a new link is needed.'
                : undefined,
          },
      createdAt: onboarding.createdAt,
      updatedAt: onboarding.updatedAt,
    };
  }
}
