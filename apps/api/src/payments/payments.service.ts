import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  TableSessionStatus,
  WebhookEventStatus,
  type Prisma,
} from '@restaurant-pos/db';
import { PrismaService } from '../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { evaluatePaymentAvailability } from '../payment-settings/payment-availability';
import { OperationsGateway } from '../realtime/operations.gateway';
import { verifyQrToken } from '../tables/qr-token';
import type { CreateStripeCheckoutDto } from './dto/create-stripe-checkout.dto';
import { checkoutEventAction, stripeObjectId } from './stripe-checkout-event';
import {
  StripeGateway,
  type StripeCheckoutSession,
  type StripeEvent,
} from './stripe.gateway';

const paidOrderStatuses: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.SENT_TO_KITCHEN,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SERVED,
  OrderStatus.COMPLETED,
];
const payableOrderStatuses: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAYMENT_PROCESSING,
];
const activePaymentStatuses: PaymentStatus[] = [
  PaymentStatus.CREATED,
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly orders: OrdersService,
    private readonly operations: OperationsGateway,
  ) {}

  async createCheckout(
    publicCode: string,
    token: string,
    orderId: string,
    idempotencyKey: string,
    dto: CreateStripeCheckoutDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 120) {
      throw new BadRequestException(
        'A valid Idempotency-Key header is required.',
      );
    }
    const qr = await this.loadValidQr(publicCode, token);
    await this.assertPaymentMethodAvailable(qr.outletId, dto.paymentMethod);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        companyId: qr.companyId,
        outletId: qr.outletId,
        tableId: qr.tableId,
      },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    if (paidOrderStatuses.includes(order.status)) {
      throw new ConflictException('This order is already paid.');
    }
    if (!payableOrderStatuses.includes(order.status)) {
      throw new ConflictException(
        `Payment cannot be created while the order is ${order.status}.`,
      );
    }

    const now = new Date();
    const active = order.payments.find(
      (payment) =>
        payment.provider === PaymentProvider.STRIPE &&
        payment.method === dto.paymentMethod &&
        activePaymentStatuses.includes(payment.status),
    );
    if (
      active?.stripeCheckoutSessionId &&
      active.stripeCheckoutUrl &&
      (!active.checkoutExpiresAt || active.checkoutExpiresAt > now)
    ) {
      return this.checkoutResponse(active);
    }

    let payment = active;
    if (
      payment?.stripeCheckoutSessionId &&
      payment.checkoutExpiresAt &&
      payment.checkoutExpiresAt <= now
    ) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.CANCELLED,
          failedAt: now,
          failureReason: 'checkout_session_expired_locally',
        },
      });
      payment = undefined;
    }
    if (!payment) {
      payment = await this.prisma.payment.create({
        data: {
          companyId: order.companyId,
          outletId: order.outletId,
          orderId: order.id,
          provider: PaymentProvider.STRIPE,
          method: dto.paymentMethod,
          status: PaymentStatus.CREATED,
          amountCents: order.grandTotalCents,
          currency: order.currency,
        },
      });
    }
    if (
      payment.creationIdempotencyKey &&
      payment.creationIdempotencyKey !== idempotencyKey &&
      !payment.stripeCheckoutSessionId
    ) {
      throw new ConflictException(
        'A Stripe Checkout session is already being created for this order.',
      );
    }
    if (!payment.creationIdempotencyKey) {
      const reserved = await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          creationIdempotencyKey: null,
          status: PaymentStatus.CREATED,
        },
        data: { creationIdempotencyKey: idempotencyKey },
      });
      if (reserved.count !== 1) {
        const current = await this.prisma.payment.findUnique({
          where: { id: payment.id },
        });
        if (current?.stripeCheckoutSessionId && current.stripeCheckoutUrl) {
          return this.checkoutResponse(current);
        }
        throw new ConflictException(
          'A Stripe Checkout session is already being created for this order.',
        );
      }
      payment = {
        ...payment,
        creationIdempotencyKey: idempotencyKey,
      };
    }

    const session = await this.stripe.createCheckoutSession(
      {
        mode: 'payment',
        payment_method_types: [
          dto.paymentMethod === PaymentMethod.STRIPE_CARD ? 'card' : 'paynow',
        ],
        client_reference_id: order.id,
        success_url: this.withCheckoutResult(dto.successUrl, order.id, true),
        cancel_url: this.withCheckoutResult(dto.cancelUrl, order.id, false),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: order.currency.toLowerCase(),
              unit_amount: order.grandTotalCents,
              product_data: {
                name: `Order ${order.orderNumber}`,
                description: 'Restaurant QR order',
              },
            },
          },
        ],
        metadata: this.stripeMetadata(order, payment.id),
        payment_intent_data: {
          metadata: this.stripeMetadata(order, payment.id),
        },
      },
      `checkout-session-${payment.id}`,
    );
    if (!session.url) {
      throw new ConflictException(
        'Stripe did not return a Checkout redirect URL.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PENDING,
          stripeCheckoutSessionId: session.id,
          stripeCheckoutUrl: session.url,
          stripePaymentIntentId: stripeObjectId(session.payment_intent),
          checkoutExpiresAt: new Date(session.expires_at * 1000),
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAYMENT_PROCESSING,
          paymentStatus: OrderPaymentStatus.PROCESSING,
        },
      });
      if (order.tableSessionId) {
        await tx.tableSession.update({
          where: { id: order.tableSessionId },
          data: { status: TableSessionStatus.PAYMENT_PENDING },
        });
      }
      await tx.auditLog.create({
        data: {
          companyId: order.companyId,
          outletId: order.outletId,
          actionType: 'STRIPE_CHECKOUT_CREATED',
          entityType: 'payment',
          entityId: payment.id,
          afterJson: {
            checkoutSessionId: session.id,
            method: dto.paymentMethod,
            amountCents: order.grandTotalCents,
          },
          reason: 'Customer started Stripe Checkout.',
          requestId,
          ipAddress,
        },
      });
      return saved;
    });
    this.operations.publishToOutlet(order.outletId, 'payment.started', {
      orderId: order.id,
      paymentId: updated.id,
      method: updated.method,
      status: updated.status,
    });
    return this.checkoutResponse(updated);
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    let event: StripeEvent;
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? `Stripe webhook signature verification failed: ${error.message}`
          : 'Stripe webhook signature verification failed.',
      );
    }

    const isCheckoutEvent = event.type.startsWith('checkout.session.');
    if (!isCheckoutEvent) {
      return this.recordIgnoredEvent(event);
    }
    const session = event.data.object as StripeCheckoutSession;
    const action = checkoutEventAction(event.type, session);
    if (action === 'IGNORED') {
      return this.recordIgnoredEvent(event);
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const recorded = await this.createWebhookEvent(tx, event);
      if (!recorded) {
        return { duplicate: true, released: false, outletId: null };
      }
      const payment = await tx.payment.findUnique({
        where: { stripeCheckoutSessionId: session.id },
        include: {
          order: {
            include: {
              outlet: true,
              table: true,
              items: { include: { modifiers: true } },
            },
          },
        },
      });
      if (!payment) {
        await tx.webhookEvent.update({
          where: { providerEventId: event.id },
          data: {
            status: WebhookEventStatus.IGNORED,
            processedAt: new Date(),
            errorMessage: 'No payment matches the Checkout Session.',
          },
        });
        return { duplicate: false, released: false, outletId: null };
      }
      await tx.webhookEvent.update({
        where: { providerEventId: event.id },
        data: {
          companyId: payment.companyId,
          outletId: payment.outletId,
          paymentId: payment.id,
        },
      });

      const validationError = this.validateSession(session, payment);
      if (validationError) {
        await tx.webhookEvent.update({
          where: { providerEventId: event.id },
          data: {
            status: WebhookEventStatus.FAILED,
            processedAt: new Date(),
            errorMessage: validationError,
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: payment.companyId,
            outletId: payment.outletId,
            actionType: 'STRIPE_WEBHOOK_REJECTED',
            entityType: 'payment',
            entityId: payment.id,
            afterJson: { eventId: event.id, eventType: event.type },
            reason: validationError,
          },
        });
        return {
          duplicate: false,
          released: false,
          outletId: payment.outletId,
        };
      }

      if (action === 'PROCESSING') {
        await tx.payment.updateMany({
          where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
          data: {
            status: PaymentStatus.PROCESSING,
            stripePaymentIntentId: stripeObjectId(session.payment_intent),
          },
        });
        await tx.order.updateMany({
          where: {
            id: payment.orderId,
            paymentStatus: { not: OrderPaymentStatus.PAID },
          },
          data: {
            status: OrderStatus.PAYMENT_PROCESSING,
            paymentStatus: OrderPaymentStatus.PROCESSING,
          },
        });
        await this.markEventProcessed(tx, event.id);
        return {
          duplicate: false,
          released: false,
          outletId: payment.outletId,
        };
      }

      if (action === 'FAILED' || action === 'CANCELLED') {
        if (payment.status !== PaymentStatus.SUCCEEDED) {
          const failedStatus =
            action === 'FAILED'
              ? PaymentStatus.FAILED
              : PaymentStatus.CANCELLED;
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: failedStatus,
              failedAt: new Date(),
              failureReason: event.type,
            },
          });
          await tx.order.updateMany({
            where: {
              id: payment.orderId,
              paymentStatus: { not: OrderPaymentStatus.PAID },
            },
            data: {
              status: OrderStatus.PENDING_PAYMENT,
              paymentStatus:
                action === 'FAILED'
                  ? OrderPaymentStatus.FAILED
                  : OrderPaymentStatus.CANCELLED,
            },
          });
        }
        await this.markEventProcessed(tx, event.id);
        return {
          duplicate: false,
          released: false,
          outletId: payment.outletId,
        };
      }

      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { not: PaymentStatus.SUCCEEDED },
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          stripePaymentIntentId: stripeObjectId(session.payment_intent),
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        await this.markEventProcessed(tx, event.id);
        return {
          duplicate: false,
          released: false,
          outletId: payment.outletId,
        };
      }

      const now = new Date();
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: OrderPaymentStatus.PAID,
          paidAt: now,
        },
      });
      await this.orders.releaseOrderToKitchen(tx, payment.order);
      await tx.clientOnboarding.updateMany({
        where: { companyId: payment.companyId },
        data: {
          stripeConnectedAt: now,
          testOrderCompletedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: payment.companyId,
          outletId: payment.outletId,
          actionType: 'STRIPE_PAYMENT_SUCCEEDED',
          entityType: 'payment',
          entityId: payment.id,
          beforeJson: { status: payment.status },
          afterJson: {
            status: PaymentStatus.SUCCEEDED,
            eventId: event.id,
            checkoutSessionId: session.id,
            amountCents: payment.amountCents,
          },
          reason: 'Verified Stripe webhook confirmed payment.',
        },
      });
      await this.markEventProcessed(tx, event.id);
      return {
        duplicate: false,
        released: true,
        outletId: payment.outletId,
        orderId: payment.orderId,
      };
    });

    if (outcome.released && outcome.outletId && outcome.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: outcome.orderId },
        include: { kitchenTickets: true },
      });
      this.operations.publishToOutlet(outcome.outletId, 'payment.confirmed', {
        orderId: outcome.orderId,
        paymentStatus: OrderPaymentStatus.PAID,
      });
      this.operations.publishToOutlet(
        outcome.outletId,
        'kitchen.ticket.created',
        {
          orderId: outcome.orderId,
          tickets: order?.kitchenTickets ?? [],
        },
      );
    }
    return { received: true, ...outcome };
  }

  private async loadValidQr(publicCode: string, token: string) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { publicCode },
      include: { outlet: true, table: true },
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

  private async assertPaymentMethodAvailable(
    outletId: string,
    method: PaymentMethod,
  ) {
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

  private stripeMetadata(
    order: {
      companyId: string;
      outletId: string;
      id: string;
      orderNumber: string;
      grandTotalCents: number;
      source: string;
    },
    paymentId: string,
  ): Record<string, string> {
    return {
      company_id: order.companyId,
      outlet_id: order.outletId,
      order_id: order.id,
      order_number: order.orderNumber,
      amount_cents: String(order.grandTotalCents),
      payment_attempt_id: paymentId,
      source: order.source.toLowerCase(),
    };
  }

  private withCheckoutResult(
    baseUrl: string,
    orderId: string,
    includeSession: boolean,
  ): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const session = includeSession ? '&session_id={CHECKOUT_SESSION_ID}' : '';
    return `${baseUrl}${separator}order_id=${encodeURIComponent(orderId)}${session}`;
  }

  private checkoutResponse(payment: {
    id: string;
    stripeCheckoutSessionId: string | null;
    stripeCheckoutUrl: string | null;
    checkoutExpiresAt: Date | null;
    status: PaymentStatus;
    method: PaymentMethod;
    amountCents: number;
    currency: string;
  }) {
    return {
      paymentId: payment.id,
      checkoutSessionId: payment.stripeCheckoutSessionId,
      checkoutUrl: payment.stripeCheckoutUrl,
      expiresAt: payment.checkoutExpiresAt,
      status: payment.status,
      method: payment.method,
      amountCents: payment.amountCents,
      currency: payment.currency,
    };
  }

  private validateSession(
    session: StripeCheckoutSession,
    payment: {
      id: string;
      orderId: string;
      companyId: string;
      outletId: string;
      amountCents: number;
      currency: string;
    },
  ): string | null {
    if (session.client_reference_id !== payment.orderId) {
      return 'Stripe client reference does not match the order.';
    }
    if (session.metadata?.payment_attempt_id !== payment.id) {
      return 'Stripe payment-attempt metadata does not match.';
    }
    if (session.metadata?.company_id !== payment.companyId) {
      return 'Stripe company metadata does not match.';
    }
    if (session.metadata?.outlet_id !== payment.outletId) {
      return 'Stripe outlet metadata does not match.';
    }
    if (session.amount_total !== payment.amountCents) {
      return 'Stripe amount does not match the server-calculated order total.';
    }
    if (session.currency?.toUpperCase() !== payment.currency.toUpperCase()) {
      return 'Stripe currency does not match the order currency.';
    }
    return null;
  }

  private async createWebhookEvent(
    tx: Prisma.TransactionClient,
    event: StripeEvent,
  ) {
    const result = await tx.webhookEvent.createMany({
      data: [
        {
          provider: PaymentProvider.STRIPE,
          providerEventId: event.id,
          eventType: event.type,
          payloadJson: JSON.parse(
            JSON.stringify(event),
          ) as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  private async markEventProcessed(
    tx: Prisma.TransactionClient,
    providerEventId: string,
  ) {
    await tx.webhookEvent.update({
      where: { providerEventId },
      data: {
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
  }

  private async recordIgnoredEvent(event: StripeEvent) {
    const result = await this.prisma.webhookEvent.createMany({
      data: [
        {
          provider: PaymentProvider.STRIPE,
          providerEventId: event.id,
          eventType: event.type,
          status: WebhookEventStatus.IGNORED,
          payloadJson: JSON.parse(
            JSON.stringify(event),
          ) as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    return {
      received: true,
      ignored: true,
      duplicate: result.count === 0,
    };
  }
}
