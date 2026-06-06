import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KitchenTicketStatus,
  MenuChannel,
  MenuStatus,
  MenuVersionStatus,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PrintJobStatus,
  PrintTemplate,
  ServiceType,
  TableSessionStatus,
  type Prisma,
} from '@restaurant-pos/db';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../database/prisma.service';
import { evaluatePaymentAvailability } from '../payment-settings/payment-availability';
import { OperationsGateway } from '../realtime/operations.gateway';
import { verifyQrToken } from '../tables/qr-token';
import { TenantService } from '../tenant/tenant.service';
import type { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { createOrderFingerprint } from './order-fingerprint';
import { calculateOrderTotals } from './order-pricing';
import { renderKitchenTicket } from './kitchen-ticket-renderer';

const orderDetailInclude = {
  table: {
    select: {
      id: true,
      tableCode: true,
      displayName: true,
      zone: { select: { name: true } },
    },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      modifiers: { orderBy: { createdAt: 'asc' as const } },
    },
  },
  payments: { orderBy: { createdAt: 'desc' as const } },
  kitchenTickets: {
    orderBy: { createdAt: 'asc' as const },
    include: { station: true },
  },
  printJobs: {
    orderBy: { createdAt: 'asc' as const },
    include: { printer: true },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly operations: OperationsGateway,
  ) {}

  async createPublicOrder(
    publicCode: string,
    token: string,
    idempotencyKey: string,
    dto: CreatePublicOrderDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 120) {
      throw new BadRequestException(
        'A valid Idempotency-Key header is required.',
      );
    }

    const qr = await this.loadValidQr(publicCode, token);
    const serviceType = dto.serviceType ?? ServiceType.DINE_IN;
    if (serviceType !== ServiceType.DINE_IN) {
      throw new BadRequestException(
        'Table QR orders currently support dine-in service only.',
      );
    }
    await this.assertPaymentMethodAvailable(qr.outletId, dto.paymentMethod);

    const fingerprint = createOrderFingerprint({
      tableId: qr.tableId,
      serviceType,
      paymentMethod: dto.paymentMethod,
      customerName: dto.customerName ?? null,
      customerPhone: dto.customerPhone ?? null,
      items: dto.items,
    });
    const existing = await this.prisma.order.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: qr.companyId,
          idempotencyKey,
        },
      },
      include: orderDetailInclude,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new ConflictException(
          'This idempotency key was already used for a different order.',
        );
      }
      return this.toPublicResponse(existing);
    }

    const menu = await this.loadPublishedQrMenu(qr.outletId);
    const publishedVersion = menu.versions[0];
    if (!publishedVersion) {
      throw new ConflictException(
        'No published QR menu is available for this outlet.',
      );
    }
    const pricedItems = this.priceItems(publishedVersion, dto);
    const totals = calculateOrderTotals({
      lines: pricedItems.map((item) => ({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        taxable: item.taxable,
        serviceChargeable: item.serviceChargeable,
      })),
      gstEnabled: qr.outlet.gstEnabled,
      gstRateBps: qr.outlet.gstRateBps,
      serviceChargeEnabled: qr.outlet.serviceChargeEnabled,
      serviceChargeBps: qr.outlet.serviceChargeBps,
    });
    const businessDateText = this.businessDate(new Date(), qr.outlet.timezone);
    const businessDate = new Date(`${businessDateText}T00:00:00.000Z`);

    let orderId: string | undefined;
    for (let attempt = 0; attempt < 2 && !orderId; attempt += 1) {
      try {
        orderId = await this.prisma.$transaction(async (tx) => {
          const sequence = await tx.orderSequence.upsert({
            where: {
              outletId_businessDate: {
                outletId: qr.outletId,
                businessDate,
              },
            },
            update: { lastNumber: { increment: 1 } },
            create: {
              outletId: qr.outletId,
              businessDate,
              lastNumber: 1,
            },
          });
          const orderNumber = `${businessDateText.replaceAll('-', '')}-${String(
            sequence.lastNumber,
          ).padStart(4, '0')}`;

          let tableSession = await tx.tableSession.findUnique({
            where: { activeTableKey: qr.tableId },
          });
          tableSession ??= await tx.tableSession.create({
            data: {
              companyId: qr.companyId,
              outletId: qr.outletId,
              tableId: qr.tableId,
              activeTableKey: qr.tableId,
              status: TableSessionStatus.ORDERING,
            },
          });

          const manualPayNow =
            dto.paymentMethod === PaymentMethod.MANUAL_PAYNOW;
          const order = await tx.order.create({
            data: {
              companyId: qr.companyId,
              outletId: qr.outletId,
              tableId: qr.tableId,
              tableSessionId: tableSession.id,
              orderNumber,
              businessDate,
              source: OrderSource.QR,
              serviceType,
              status: OrderStatus.PENDING_PAYMENT,
              paymentStatus: manualPayNow
                ? OrderPaymentStatus.MANUAL_VERIFICATION_REQUIRED
                : OrderPaymentStatus.PENDING,
              currency: qr.outlet.currency,
              ...totals,
              idempotencyKey,
              requestFingerprint: fingerprint,
              customerName: dto.customerName,
              customerPhone: dto.customerPhone,
              items: {
                create: pricedItems.map((item) => ({
                  companyId: qr.companyId,
                  menuItemId: item.menuItemId,
                  itemName: item.itemName,
                  sku: item.sku,
                  variantId: item.variantId,
                  variantName: item.variantName,
                  preparationStationKey: item.preparationStationKey,
                  quantity: item.quantity,
                  baseUnitPriceCents: item.baseUnitPriceCents,
                  modifierUnitCents: item.modifierUnitCents,
                  unitPriceCents: item.unitPriceCents,
                  lineTotalCents: item.lineTotalCents,
                  taxable: item.taxable,
                  serviceChargeable: item.serviceChargeable,
                  remarks: item.remarks,
                  modifiers: {
                    create: item.modifiers.map((modifier) => ({
                      companyId: qr.companyId,
                      modifierGroupId: modifier.modifierGroupId,
                      modifierGroupName: modifier.modifierGroupName,
                      modifierOptionId: modifier.modifierOptionId,
                      modifierOptionName: modifier.modifierOptionName,
                      priceDeltaCents: modifier.priceDeltaCents,
                    })),
                  },
                })),
              },
              payments: {
                create: {
                  companyId: qr.companyId,
                  outletId: qr.outletId,
                  provider: manualPayNow
                    ? PaymentProvider.MANUAL
                    : PaymentProvider.STRIPE,
                  method: dto.paymentMethod,
                  status: manualPayNow
                    ? PaymentStatus.MANUAL_VERIFICATION_REQUIRED
                    : PaymentStatus.CREATED,
                  amountCents: totals.grandTotalCents,
                  currency: qr.outlet.currency,
                },
              },
            },
          });
          await tx.tableSession.update({
            where: { id: tableSession.id },
            data: {
              status: manualPayNow
                ? TableSessionStatus.PAYMENT_PENDING
                : TableSessionStatus.ORDERED,
            },
          });
          await tx.auditLog.create({
            data: {
              companyId: qr.companyId,
              outletId: qr.outletId,
              actionType: 'QR_ORDER_CREATED',
              entityType: 'order',
              entityId: order.id,
              afterJson: {
                orderNumber,
                totalCents: totals.grandTotalCents,
                paymentMethod: dto.paymentMethod,
                source: OrderSource.QR,
              },
              reason: 'Customer submitted a server-priced QR order.',
              requestId,
              ipAddress,
            },
          });
          return order.id;
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
        const duplicate = await this.prisma.order.findUnique({
          where: {
            companyId_idempotencyKey: {
              companyId: qr.companyId,
              idempotencyKey,
            },
          },
          include: orderDetailInclude,
        });
        if (duplicate) {
          if (duplicate.requestFingerprint !== fingerprint) {
            throw new ConflictException(
              'This idempotency key was already used for a different order.',
            );
          }
          return this.toPublicResponse(duplicate);
        }
        if (attempt === 1) {
          throw new ConflictException(
            'The table session changed while the order was submitted. Please retry.',
          );
        }
      }
    }
    if (!orderId) {
      throw new ConflictException('Order could not be created.');
    }

    const order = await this.loadOrder(orderId);
    this.operations.publishToOutlet(qr.outletId, 'order.created', {
      orderId,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalCents: order.grandTotalCents,
    });
    return this.toPublicResponse(order);
  }

  async getPublicOrder(publicCode: string, token: string, orderId: string) {
    const qr = await this.loadValidQr(publicCode, token);
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        companyId: qr.companyId,
        outletId: qr.outletId,
        tableId: qr.tableId,
      },
      include: orderDetailInclude,
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return this.toPublicResponse(order);
  }

  async listAdmin(
    user: AuthenticatedUser,
    outletId: string,
    status?: OrderStatus,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    return this.prisma.order.findMany({
      where: {
        companyId: user.companyId,
        outletId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        table: { select: { tableCode: true, displayName: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { method: true, status: true },
        },
        kitchenTickets: {
          select: { id: true, status: true, stationId: true },
        },
      },
    });
  }

  async getAdmin(user: AuthenticatedUser, outletId: string, orderId: string) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, companyId: user.companyId, outletId },
      include: orderDetailInclude,
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  async verifyManualPayNow(
    user: AuthenticatedUser,
    outletId: string,
    orderId: string,
    idempotencyKey: string,
    input: {
      amountCents: number;
      reference: string;
      reason: string;
    },
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    if (!idempotencyKey || idempotencyKey.length > 120) {
      throw new BadRequestException(
        'A valid Idempotency-Key header is required.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, companyId: user.companyId, outletId },
        include: {
          outlet: true,
          table: true,
          items: { include: { modifiers: true } },
          payments: {
            where: { method: PaymentMethod.MANUAL_PAYNOW },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!order) {
        throw new NotFoundException('Order not found.');
      }
      const payment = order.payments[0];
      if (!payment) {
        throw new ConflictException(
          'This order has no manual PayNow payment to verify.',
        );
      }
      if (
        payment.verificationIdempotencyKey &&
        payment.verificationIdempotencyKey !== idempotencyKey
      ) {
        if (payment.status === PaymentStatus.SUCCEEDED) {
          return { orderId: order.id, alreadyVerified: true };
        }
        throw new ConflictException(
          'Manual PayNow verification is already in progress.',
        );
      }
      if (payment.status === PaymentStatus.SUCCEEDED) {
        return { orderId: order.id, alreadyVerified: true };
      }
      if (input.amountCents !== order.grandTotalCents) {
        throw new BadRequestException(
          'Verified amount does not match the server-calculated order total.',
        );
      }
      if (
        payment.status !== PaymentStatus.MANUAL_VERIFICATION_REQUIRED ||
        order.status !== OrderStatus.PENDING_PAYMENT
      ) {
        throw new ConflictException(
          'This order is not awaiting manual PayNow verification.',
        );
      }

      const now = new Date();
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          manualReference: input.reference,
          verificationIdempotencyKey: idempotencyKey,
          verifiedByUserId: user.userId,
          verifiedAt: now,
          paidAt: now,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: OrderPaymentStatus.PAID,
          paidAt: now,
        },
      });
      await this.releaseOrderToKitchen(tx, order);
      await tx.clientOnboarding.updateMany({
        where: {
          companyId: user.companyId,
          testOrderCompletedAt: null,
        },
        data: { testOrderCompletedAt: now },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'MANUAL_PAYNOW_VERIFIED',
          entityType: 'payment',
          entityId: payment.id,
          beforeJson: { status: payment.status },
          afterJson: {
            status: PaymentStatus.SUCCEEDED,
            amountCents: input.amountCents,
            reference: input.reference,
          },
          reason: input.reason,
          requestId,
          ipAddress,
        },
      });
      return { orderId: order.id, alreadyVerified: false };
    });

    const order = await this.loadOrder(result.orderId);
    if (!result.alreadyVerified) {
      this.operations.publishToOutlet(outletId, 'payment.confirmed', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
      });
      this.operations.publishToOutlet(outletId, 'kitchen.ticket.created', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        tickets: order.kitchenTickets.map((ticket) => ({
          id: ticket.id,
          stationId: ticket.stationId,
        })),
      });
    }
    return order;
  }

  async updateStatus(
    user: AuthenticatedUser,
    outletId: string,
    orderId: string,
    nextStatus: OrderStatus,
    reason: string,
    requestId?: string,
    ipAddress?: string,
  ) {
    await this.tenant.assertOutlet(user.companyId, outletId);
    const allowed: Partial<Record<OrderStatus, OrderStatus>> = {
      [OrderStatus.SENT_TO_KITCHEN]: OrderStatus.PREPARING,
      [OrderStatus.PREPARING]: OrderStatus.READY,
      [OrderStatus.READY]: OrderStatus.SERVED,
      [OrderStatus.SERVED]: OrderStatus.COMPLETED,
    };

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, companyId: user.companyId, outletId },
      });
      if (!order) {
        throw new NotFoundException('Order not found.');
      }
      if (allowed[order.status] !== nextStatus) {
        throw new ConflictException(
          `Order cannot move from ${order.status} to ${nextStatus}.`,
        );
      }

      const now = new Date();
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          ...(nextStatus === OrderStatus.COMPLETED ? { completedAt: now } : {}),
        },
      });
      const ticketData =
        nextStatus === OrderStatus.PREPARING
          ? {
              status: KitchenTicketStatus.PREPARING,
              preparingAt: now,
            }
          : nextStatus === OrderStatus.READY
            ? { status: KitchenTicketStatus.READY, readyAt: now }
            : nextStatus === OrderStatus.SERVED ||
                nextStatus === OrderStatus.COMPLETED
              ? {
                  status: KitchenTicketStatus.COMPLETED,
                  completedAt: now,
                }
              : undefined;
      if (ticketData) {
        await tx.kitchenTicket.updateMany({
          where: { orderId: order.id },
          data: ticketData,
        });
      }
      if (order.tableSessionId) {
        await tx.tableSession.update({
          where: { id: order.tableSessionId },
          data:
            nextStatus === OrderStatus.PREPARING
              ? { status: TableSessionStatus.PREPARING }
              : nextStatus === OrderStatus.SERVED
                ? { status: TableSessionStatus.SERVED }
                : nextStatus === OrderStatus.COMPLETED
                  ? {
                      status: TableSessionStatus.CLOSED,
                      activeTableKey: null,
                      closedAt: now,
                    }
                  : {},
        });
      }
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          outletId,
          actorUserId: user.userId,
          actionType: 'ORDER_STATUS_CHANGED',
          entityType: 'order',
          entityId: order.id,
          beforeJson: { status: order.status },
          afterJson: { status: nextStatus },
          reason,
          requestId,
          ipAddress,
        },
      });
    });

    const order = await this.getAdmin(user, outletId, orderId);
    this.operations.publishToOutlet(outletId, 'order.status.changed', {
      orderId,
      status: nextStatus,
    });
    return order;
  }

  private async loadValidQr(publicCode: string, token: string) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode },
      include: {
        outlet: true,
        table: true,
      },
    });
    const valid =
      qr?.active &&
      (!qr.expiresAt || qr.expiresAt.getTime() > Date.now()) &&
      verifyQrToken(token, qr.tokenHash);
    if (!qr || !valid || !qr.table.active) {
      throw new NotFoundException('QR code not found.');
    }
    return qr;
  }

  private async loadPublishedQrMenu(outletId: string) {
    const menu = await this.prisma.menu.findFirst({
      where: {
        outletId,
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
            items: {
              include: {
                variants: true,
                itemModifierGroups: {
                  include: {
                    modifierGroup: { include: { options: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!menu?.versions[0]) {
      throw new ConflictException(
        'No published QR menu is available for this outlet.',
      );
    }
    return menu;
  }

  private priceItems(
    version: Awaited<
      ReturnType<OrdersService['loadPublishedQrMenu']>
    >['versions'][number],
    dto: CreatePublicOrderDto,
  ) {
    const itemById = new Map(version.items.map((item) => [item.id, item]));
    return dto.items.map((requested) => {
      const item = itemById.get(requested.menuItemId);
      if (!item || !item.active) {
        throw new BadRequestException(
          `Menu item ${requested.menuItemId} is not available.`,
        );
      }
      if (item.soldOut) {
        throw new ConflictException(`Menu item ${item.name} is sold out.`);
      }
      const variant = requested.variantId
        ? item.variants.find(
            (candidate) =>
              candidate.id === requested.variantId && candidate.active,
          )
        : undefined;
      if (requested.variantId && !variant) {
        throw new BadRequestException(
          `Variant ${requested.variantId} is not available for ${item.name}.`,
        );
      }

      const selectedIds = requested.modifierOptionIds ?? [];
      if (new Set(selectedIds).size !== selectedIds.length) {
        throw new BadRequestException(
          `Duplicate modifier options were submitted for ${item.name}.`,
        );
      }
      const selected = [];
      for (const itemGroup of item.itemModifierGroups) {
        const group = itemGroup.modifierGroup;
        const options = group.options.filter(
          (option) => option.active && selectedIds.includes(option.id),
        );
        if (
          options.length < group.minSelect ||
          options.length > group.maxSelect
        ) {
          throw new BadRequestException(
            `${item.name} requires ${group.minSelect}-${group.maxSelect} selections from ${group.name}.`,
          );
        }
        selected.push(
          ...options.map((option) => ({
            modifierGroupId: group.id,
            modifierGroupName: group.name,
            modifierOptionId: option.id,
            modifierOptionName: option.name,
            priceDeltaCents: option.priceDeltaCents,
          })),
        );
      }
      if (selected.length !== selectedIds.length) {
        throw new BadRequestException(
          `One or more modifier options are invalid for ${item.name}.`,
        );
      }

      const modifierUnitCents = selected.reduce(
        (total, option) => total + option.priceDeltaCents,
        0,
      );
      const baseUnitPriceCents =
        item.basePriceCents + (variant?.priceDeltaCents ?? 0);
      const unitPriceCents = baseUnitPriceCents + modifierUnitCents;
      return {
        menuItemId: item.id,
        itemName: item.name,
        sku: item.sku,
        variantId: variant?.id,
        variantName: variant?.name,
        preparationStationKey: item.preparationStationKey,
        quantity: requested.quantity,
        baseUnitPriceCents,
        modifierUnitCents,
        unitPriceCents,
        lineTotalCents: unitPriceCents * requested.quantity,
        taxable: item.taxable,
        serviceChargeable: item.serviceChargeable,
        remarks: requested.remarks,
        modifiers: selected,
      };
    });
  }

  private async assertPaymentMethodAvailable(
    outletId: string,
    method: PaymentMethod,
  ): Promise<void> {
    const [control, methods] = await Promise.all([
      this.prisma.outletPaymentControl.findUnique({ where: { outletId } }),
      this.prisma.paymentMethodSetting.findMany({ where: { outletId } }),
    ]);
    if (!control) {
      throw new ConflictException(
        'Payment settings are not configured for this outlet.',
      );
    }
    const availability = evaluatePaymentAvailability({
      online: {
        enabled: control.onlinePaymentsEnabled,
        disabledUntil: control.onlineDisabledUntil,
      },
      stripe: {
        enabled: control.stripePaymentsEnabled,
        disabledUntil: control.stripeDisabledUntil,
      },
      methods,
    });
    if (!availability[method]) {
      throw new ConflictException(
        `${method} is currently unavailable for this outlet.`,
      );
    }
  }

  async releaseOrderToKitchen(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      companyId: string;
      outletId: string;
      orderNumber: string;
      createdAt: Date;
      tableSessionId: string | null;
      table: { displayName: string } | null;
      outlet: { name: string };
      items: Array<{
        itemName: string;
        variantName: string | null;
        preparationStationKey: string;
        quantity: number;
        remarks: string | null;
        modifiers: Array<{ modifierOptionName: string }>;
      }>;
    },
  ): Promise<void> {
    const grouped = new Map<string, typeof order.items>();
    for (const item of order.items) {
      const items = grouped.get(item.preparationStationKey) ?? [];
      items.push(item);
      grouped.set(item.preparationStationKey, items);
    }
    for (const [stationKey, items] of grouped) {
      const station = await tx.kitchenStation.upsert({
        where: {
          outletId_key: {
            outletId: order.outletId,
            key: stationKey,
          },
        },
        update: {},
        create: {
          companyId: order.companyId,
          outletId: order.outletId,
          key: stationKey,
          name: this.stationName(stationKey),
        },
      });
      const route = await tx.printerRoute.findUnique({
        where: { stationId: station.id },
      });
      const payload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        stationKey,
        tableName: order.table?.displayName ?? 'Counter',
        items: items.map((item) => ({
          name: item.itemName,
          variant: item.variantName,
          quantity: item.quantity,
          modifiers: item.modifiers.map(
            (modifier) => modifier.modifierOptionName,
          ),
          remarks: item.remarks,
        })),
      };
      const ticket = await tx.kitchenTicket.create({
        data: {
          companyId: order.companyId,
          outletId: order.outletId,
          orderId: order.id,
          stationId: station.id,
          status: KitchenTicketStatus.SENT,
          payloadJson: payload,
          sentAt: new Date(),
        },
      });
      await tx.printJob.create({
        data: {
          companyId: order.companyId,
          outletId: order.outletId,
          orderId: order.id,
          kitchenTicketId: ticket.id,
          printerId: route?.primaryPrinterId,
          template:
            stationKey.includes('bar') || stationKey.includes('drink')
              ? PrintTemplate.BAR_TICKET
              : PrintTemplate.KITCHEN_TICKET,
          payloadJson: payload,
          renderedText: renderKitchenTicket({
            outletName: order.outlet.name,
            stationName: station.name,
            orderNumber: order.orderNumber,
            tableName: order.table?.displayName ?? 'Counter',
            createdAt: order.createdAt,
            items,
          }),
          status: route ? PrintJobStatus.QUEUED : PrintJobStatus.FAILED,
          lastError: route
            ? null
            : `No active printer route for station ${station.key}.`,
        },
      });
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.SENT_TO_KITCHEN,
        sentToKitchenAt: new Date(),
      },
    });
    if (order.tableSessionId) {
      await tx.tableSession.update({
        where: { id: order.tableSessionId },
        data: { status: TableSessionStatus.PREPARING },
      });
    }
  }

  private async loadOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderDetailInclude,
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  private toPublicResponse(
    order: Awaited<ReturnType<OrdersService['loadOrder']>>,
  ) {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotalCents: order.subtotalCents,
      discountTotalCents: order.discountTotalCents,
      serviceChargeTotalCents: order.serviceChargeTotalCents,
      gstTotalCents: order.gstTotalCents,
      roundingAdjustmentCents: order.roundingAdjustmentCents,
      grandTotalCents: order.grandTotalCents,
      table: order.table,
      items: order.items,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private businessDate(date: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  private stationName(key: string): string {
    return key
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
