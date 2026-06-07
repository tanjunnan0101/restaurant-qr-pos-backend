import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentMethod,
  type PaymentMethodSetting,
  type Prisma,
} from '@restaurant-pos/db';
import type { PaymentScope } from '@restaurant-pos/types';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import type {
  DisablePaymentScopeDto,
  EnablePaymentScopeDto,
} from './dto/payment-control.dto';
import { evaluatePaymentAvailability } from './payment-availability';

@Injectable()
export class PaymentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async get(user: AuthenticatedUser, outletId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const settings = await this.loadSettings(outletId);
    return this.toResponse(settings);
  }

  async disable(
    user: AuthenticatedUser,
    outletId: string,
    dto: DisablePaymentScopeDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const until = dto.until ? new Date(dto.until) : null;
    if (until && until.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Disable-until time must be in the future.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await this.loadSettingsWithClient(tx, outletId);
      await this.applyDisable(tx, user, outletId, dto.scope, until, dto.reason);
      const after = await this.loadSettingsWithClient(tx, outletId);
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'PAYMENT_SCOPE_DISABLED',
          entityType: 'payment_settings',
          entityId: after.control.id,
          beforeJson: before as unknown as Prisma.InputJsonValue,
          afterJson: after as unknown as Prisma.InputJsonValue,
          reason: dto.reason,
          requestId,
          ipAddress,
        },
      });
    });

    return this.get(user, outletId);
  }

  async enable(
    user: AuthenticatedUser,
    outletId: string,
    dto: EnablePaymentScopeDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);

    await this.prisma.$transaction(async (tx) => {
      const before = await this.loadSettingsWithClient(tx, outletId);
      await this.applyEnable(tx, user, outletId, dto.scope);
      const after = await this.loadSettingsWithClient(tx, outletId);
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'PAYMENT_SCOPE_ENABLED',
          entityType: 'payment_settings',
          entityId: after.control.id,
          beforeJson: before as unknown as Prisma.InputJsonValue,
          afterJson: after as unknown as Prisma.InputJsonValue,
          reason: dto.reason,
          requestId,
          ipAddress,
        },
      });
    });

    return this.get(user, outletId);
  }

  private async applyDisable(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    outletId: string,
    scope: PaymentScope,
    until: Date | null,
    reason: string,
  ): Promise<void> {
    const enabled = until !== null;

    if (scope === 'ONLINE') {
      await tx.outletPaymentControl.update({
        where: { outletId },
        data: {
          onlinePaymentsEnabled: enabled,
          onlineDisabledUntil: until,
          onlineDisabledReason: reason,
          updatedByUserId: user.userId,
          version: { increment: 1 },
        },
      });
      return;
    }

    if (scope === 'STRIPE') {
      await tx.outletPaymentControl.update({
        where: { outletId },
        data: {
          stripePaymentsEnabled: enabled,
          stripeDisabledUntil: until,
          stripeDisabledReason: reason,
          updatedByUserId: user.userId,
          version: { increment: 1 },
        },
      });
      return;
    }

    await tx.paymentMethodSetting.update({
      where: {
        outletId_method: {
          outletId,
          method: this.toPaymentMethod(scope),
        },
      },
      data: {
        enabled,
        disabledUntil: until,
        disabledReason: reason,
        updatedByUserId: user.userId,
        version: { increment: 1 },
      },
    });
  }

  private async applyEnable(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    outletId: string,
    scope: PaymentScope,
  ): Promise<void> {
    if (scope === 'ONLINE') {
      await tx.outletPaymentControl.update({
        where: { outletId },
        data: {
          onlinePaymentsEnabled: true,
          onlineDisabledUntil: null,
          onlineDisabledReason: null,
          updatedByUserId: user.userId,
          version: { increment: 1 },
        },
      });
      return;
    }

    if (scope === 'STRIPE') {
      await tx.outletPaymentControl.update({
        where: { outletId },
        data: {
          stripePaymentsEnabled: true,
          stripeDisabledUntil: null,
          stripeDisabledReason: null,
          updatedByUserId: user.userId,
          version: { increment: 1 },
        },
      });
      return;
    }

    await tx.paymentMethodSetting.update({
      where: {
        outletId_method: {
          outletId,
          method: this.toPaymentMethod(scope),
        },
      },
      data: {
        enabled: true,
        disabledUntil: null,
        disabledReason: null,
        updatedByUserId: user.userId,
        version: { increment: 1 },
      },
    });
  }

  private toPaymentMethod(scope: PaymentScope): PaymentMethod {
    if (
      scope === 'ONLINE_CARD' ||
      scope === 'STRIPE_PAYNOW' ||
      scope === 'MANUAL_PAYNOW'
    ) {
      return PaymentMethod[scope];
    }
    throw new BadRequestException('Scope is not a payment method.');
  }

  private async loadSettings(outletId: string) {
    return this.loadSettingsWithClient(this.prisma, outletId);
  }

  private async loadSettingsWithClient(
    client: Prisma.TransactionClient | PrismaService,
    outletId: string,
  ) {
    const control = await client.outletPaymentControl.findUnique({
      where: { outletId },
    });
    const methods = await client.paymentMethodSetting.findMany({
      where: { outletId },
      orderBy: { method: 'asc' },
    });

    if (!control || methods.length === 0) {
      throw new NotFoundException(
        'Payment settings have not been initialized for this outlet.',
      );
    }
    return { control, methods };
  }

  private toResponse(settings: {
    control: {
      onlinePaymentsEnabled: boolean;
      onlineDisabledUntil: Date | null;
      onlineDisabledReason: string | null;
      stripePaymentsEnabled: boolean;
      stripeDisabledUntil: Date | null;
      stripeDisabledReason: string | null;
      version: number;
      updatedAt: Date;
    };
    methods: PaymentMethodSetting[];
  }) {
    const effective = evaluatePaymentAvailability({
      online: {
        enabled: settings.control.onlinePaymentsEnabled,
        disabledUntil: settings.control.onlineDisabledUntil,
      },
      stripe: {
        enabled: settings.control.stripePaymentsEnabled,
        disabledUntil: settings.control.stripeDisabledUntil,
      },
      methods: settings.methods,
    });

    return {
      online: {
        configuredEnabled: settings.control.onlinePaymentsEnabled,
        disabledUntil: settings.control.onlineDisabledUntil,
        reason: settings.control.onlineDisabledReason,
      },
      stripe: {
        configuredEnabled: settings.control.stripePaymentsEnabled,
        disabledUntil: settings.control.stripeDisabledUntil,
        reason: settings.control.stripeDisabledReason,
      },
      methods: settings.methods.map((method) => ({
        method: method.method,
        configuredEnabled: method.enabled,
        disabledUntil: method.disabledUntil,
        reason: method.disabledReason,
        effectiveEnabled: effective[method.method],
      })),
      version: settings.control.version,
      updatedAt: settings.control.updatedAt,
    };
  }
}
