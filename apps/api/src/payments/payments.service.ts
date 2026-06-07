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
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ReconcileHitPayReturnDto } from './dto/reconcile-hitpay-return.dto';
import {
  HitPayGateway,
  type HitPayPayment,
  type HitPayPaymentRequest,
} from './hitpay.gateway';

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

type PaymentWithOrder = Awaited<
  ReturnType<PaymentsService['loadPaymentForProcessing']>
>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hitpay: HitPayGateway,
    private readonly orders: OrdersService,
    private readonly operations: OperationsGateway,
  ) {}

  async createCheckout(
    publicCode: string,
    token: string,
    orderId: string,
    idempotencyKey: string,
    dto: CreateCheckoutDto,
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
        payment.provider === PaymentProvider.HITPAY &&
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
          provider: PaymentProvider.HITPAY,
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
        'A HitPay checkout is already being created for this order.',
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
          'A HitPay checkout is already being created for this order.',
        );
      }
      payment = {
        ...payment,
        creationIdempotencyKey: idempotencyKey,
      };
    }

    const paymentRequest = await this.hitpay.createPaymentRequest({
      amount: this.centsToMajorUnit(order.grandTotalCents),
      currency: order.currency,
      paymentMethods: ['card'],
      purpose: `Restaurant QR order ${order.orderNumber}`,
      referenceNumber: payment.id,
      redirectUrl: this.withCheckoutResult(dto.successUrl, order.id),
      metadata: {
        company_id: order.companyId,
        outlet_id: order.outletId,
        order_id: order.id,
        order_number: order.orderNumber,
        payment_attempt_id: payment.id,
      },
    });
    if (!paymentRequest.url) {
      throw new ConflictException(
        'HitPay did not return a checkout redirect URL.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PENDING,
          stripeCheckoutSessionId: paymentRequest.id,
          stripeCheckoutUrl: paymentRequest.url,
          checkoutExpiresAt: paymentRequest.expiry_date
            ? new Date(paymentRequest.expiry_date)
            : null,
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
          actionType: 'HITPAY_CHECKOUT_CREATED',
          entityType: 'payment',
          entityId: payment.id,
          afterJson: {
            paymentRequestId: paymentRequest.id,
            method: dto.paymentMethod,
            amountCents: order.grandTotalCents,
          },
          reason: 'Customer started HitPay hosted checkout.',
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

  async handleHitPayWebhook(
    rawBody: Buffer,
    signature: string,
    eventType: string | undefined,
    eventObject: string | undefined,
  ) {
    let paymentRequest: HitPayPaymentRequest;
    try {
      this.hitpay.verifyWebhookSignature(rawBody, signature);
      paymentRequest = JSON.parse(
        rawBody.toString('utf8'),
      ) as HitPayPaymentRequest;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? `HitPay webhook verification failed: ${error.message}`
          : 'HitPay webhook verification failed.',
      );
    }

    if (eventObject !== 'payment_request') {
      return this.recordIgnoredEvent(
        this.hitPayProviderEventId(eventType ?? 'unknown', paymentRequest.id),
        eventType ?? 'unknown',
        paymentRequest,
      );
    }

    const normalizedStatus = this.normalizeHitPayStatus(
      eventType ?? paymentRequest.status,
    );
    if (normalizedStatus === 'PROCESSING') {
      return this.recordIgnoredEvent(
        this.hitPayProviderEventId(eventType ?? 'pending', paymentRequest.id),
        eventType ?? paymentRequest.status,
        paymentRequest,
      );
    }

    const providerEventId = this.hitPayProviderEventId(
      eventType ?? paymentRequest.status,
      paymentRequest.id,
    );
    const outcome = await this.prisma.$transaction(async (tx) => {
      const recorded = await this.createWebhookEvent(
        tx,
        providerEventId,
        eventType ?? paymentRequest.status,
        paymentRequest,
      );
      if (!recorded) {
        return {
          duplicate: true,
          released: false,
          outletId: null,
          orderId: null,
        };
      }

      const payment = await this.findPaymentForProviderUpdate(
        tx,
        paymentRequest,
      );
      if (!payment) {
        await tx.webhookEvent.update({
          where: { providerEventId },
          data: {
            status: WebhookEventStatus.IGNORED,
            processedAt: new Date(),
            errorMessage: 'No payment matches the HitPay payment request.',
          },
        });
        return {
          duplicate: false,
          released: false,
          outletId: null,
          orderId: null,
        };
      }

      await tx.webhookEvent.update({
        where: { providerEventId },
        data: {
          companyId: payment.companyId,
          outletId: payment.outletId,
          paymentId: payment.id,
        },
      });

      const validationError = this.validateHitPayPaymentRequest(
        paymentRequest,
        payment,
      );
      if (validationError) {
        await tx.webhookEvent.update({
          where: { providerEventId },
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
            actionType: 'HITPAY_WEBHOOK_REJECTED',
            entityType: 'payment',
            entityId: payment.id,
            afterJson: {
              providerEventId,
              paymentRequestId: paymentRequest.id,
              eventType,
            },
            reason: validationError,
          },
        });
        return {
          duplicate: false,
          released: false,
          outletId: payment.outletId,
          orderId: payment.orderId,
        };
      }

      const result = await this.applyHitPayStatus(tx, payment, paymentRequest, {
        source: 'webhook',
        statusHint: eventType,
      });
      await this.markEventProcessed(tx, providerEventId);
      return result;
    });

    await this.publishReleaseEvents(
      outcome.outletId,
      outcome.orderId,
      outcome.released,
    );
    return { received: true, ...outcome };
  }

  async reconcileHitPayReturn(
    publicCode: string,
    token: string,
    orderId: string,
    dto: ReconcileHitPayReturnDto,
    requestId?: string,
    ipAddress?: string,
  ) {
    const qr = await this.loadValidQr(publicCode, token);
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

    const payment = order.payments.find(
      (entry) =>
        entry.provider === PaymentProvider.HITPAY &&
        entry.method === PaymentMethod.STRIPE_CARD,
    );
    if (!payment?.stripeCheckoutSessionId) {
      return {
        reconciled: false,
        reason: 'No active HitPay checkout was found for this order.',
      };
    }

    if (dto.reference && dto.reference !== payment.stripeCheckoutSessionId) {
      throw new ConflictException(
        'The returned HitPay payment reference does not match this order.',
      );
    }

    const paymentRequest = await this.hitpay.getPaymentRequest(
      dto.reference ?? payment.stripeCheckoutSessionId,
    );
    const outcome = await this.prisma.$transaction(async (tx) => {
      const freshPayment = await this.loadPaymentForProcessing(tx, payment.id);
      if (!freshPayment) {
        throw new NotFoundException('Payment not found.');
      }

      const validationError = this.validateHitPayPaymentRequest(
        paymentRequest,
        freshPayment,
      );
      if (validationError) {
        throw new ConflictException(validationError);
      }

      const result = await this.applyHitPayStatus(
        tx,
        freshPayment,
        paymentRequest,
        {
          source: 'redirect',
          statusHint: dto.status,
          requestId,
          ipAddress,
        },
      );

      await tx.auditLog.create({
        data: {
          companyId: freshPayment.companyId,
          outletId: freshPayment.outletId,
          actionType: 'HITPAY_RETURN_RECONCILED',
          entityType: 'payment',
          entityId: freshPayment.id,
          afterJson: {
            paymentRequestId: paymentRequest.id,
            status: paymentRequest.status,
          },
          reason: 'Customer returned from HitPay checkout.',
          requestId,
          ipAddress,
        },
      });

      return result;
    });

    await this.publishReleaseEvents(
      outcome.outletId,
      outcome.orderId,
      outcome.released,
    );
    return {
      reconciled: true,
      released: outcome.released,
      providerStatus: paymentRequest.status,
    };
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

  private withCheckoutResult(baseUrl: string, orderId: string): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}order_id=${encodeURIComponent(orderId)}`;
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

  private validateHitPayPaymentRequest(
    paymentRequest: HitPayPaymentRequest,
    payment: {
      id: string;
      orderId: string;
      companyId: string;
      outletId: string;
      amountCents: number;
      currency: string;
      stripeCheckoutSessionId: string | null;
    },
  ): string | null {
    if (
      payment.stripeCheckoutSessionId &&
      paymentRequest.id !== payment.stripeCheckoutSessionId
    ) {
      return 'HitPay payment request does not match the server checkout reference.';
    }
    if (
      paymentRequest.reference_number &&
      paymentRequest.reference_number !== payment.id
    ) {
      return 'HitPay reference number does not match the payment attempt.';
    }
    if (
      this.parseAmountToCents(paymentRequest.amount) !== payment.amountCents
    ) {
      return 'HitPay amount does not match the server-calculated order total.';
    }
    if (
      paymentRequest.currency?.toUpperCase() !== payment.currency.toUpperCase()
    ) {
      return 'HitPay currency does not match the order currency.';
    }
    return null;
  }

  private async applyHitPayStatus(
    tx: Prisma.TransactionClient,
    payment: NonNullable<PaymentWithOrder>,
    paymentRequest: HitPayPaymentRequest,
    context: {
      source: 'webhook' | 'redirect';
      statusHint?: string;
      requestId?: string;
      ipAddress?: string;
    },
  ) {
    const normalizedStatus = this.normalizeHitPayStatus(
      context.statusHint ?? paymentRequest.status,
    );
    const providerPayment = this.primaryHitPayPayment(paymentRequest);

    if (normalizedStatus === 'PROCESSING') {
      await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
        data: {
          status: PaymentStatus.PROCESSING,
          stripeCheckoutSessionId: paymentRequest.id,
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
      return {
        duplicate: false,
        released: false,
        outletId: payment.outletId,
        orderId: payment.orderId,
      };
    }

    if (normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELLED') {
      if (payment.status !== PaymentStatus.SUCCEEDED) {
        const failedStatus =
          normalizedStatus === 'FAILED'
            ? PaymentStatus.FAILED
            : PaymentStatus.CANCELLED;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: failedStatus,
            failedAt: new Date(),
            failureReason: this.hitPayFailureReason(
              paymentRequest,
              context.statusHint,
            ),
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
              normalizedStatus === 'FAILED'
                ? OrderPaymentStatus.FAILED
                : OrderPaymentStatus.CANCELLED,
          },
        });
        await tx.auditLog.create({
          data: {
            companyId: payment.companyId,
            outletId: payment.outletId,
            actionType: 'HITPAY_PAYMENT_FAILED',
            entityType: 'payment',
            entityId: payment.id,
            afterJson: {
              paymentRequestId: paymentRequest.id,
              providerStatus: paymentRequest.status,
            },
            reason: this.hitPayFailureReason(
              paymentRequest,
              context.statusHint,
            ),
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          },
        });
      }
      return {
        duplicate: false,
        released: false,
        outletId: payment.outletId,
        orderId: payment.orderId,
      };
    }

    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { not: PaymentStatus.SUCCEEDED },
      },
      data: {
        status: PaymentStatus.SUCCEEDED,
        stripeCheckoutSessionId: paymentRequest.id,
        stripePaymentIntentId: providerPayment?.id ?? null,
        providerFeeCents: this.parseOptionalAmountToCents(
          providerPayment?.fees,
        ),
        netAmountCents: this.computeNetAmountCents(
          paymentRequest,
          providerPayment,
        ),
        paidAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return {
        duplicate: false,
        released: false,
        outletId: payment.outletId,
        orderId: payment.orderId,
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
        actionType: 'HITPAY_PAYMENT_SUCCEEDED',
        entityType: 'payment',
        entityId: payment.id,
        beforeJson: { status: payment.status },
        afterJson: {
          status: PaymentStatus.SUCCEEDED,
          paymentRequestId: paymentRequest.id,
          providerPaymentId: providerPayment?.id ?? null,
          amountCents: payment.amountCents,
        },
        reason:
          context.source === 'webhook'
            ? 'Verified HitPay webhook confirmed payment.'
            : 'Verified HitPay checkout return confirmed payment.',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      },
    });

    return {
      duplicate: false,
      released: true,
      outletId: payment.outletId,
      orderId: payment.orderId,
    };
  }

  private async findPaymentForProviderUpdate(
    tx: Prisma.TransactionClient,
    paymentRequest: HitPayPaymentRequest,
  ) {
    let payment = await tx.payment.findUnique({
      where: { stripeCheckoutSessionId: paymentRequest.id },
      include: this.paymentProcessingInclude(),
    });
    if (payment) {
      return payment;
    }

    if (
      paymentRequest.reference_number &&
      this.isUuidLike(paymentRequest.reference_number)
    ) {
      payment = await tx.payment.findUnique({
        where: { id: paymentRequest.reference_number },
        include: this.paymentProcessingInclude(),
      });
    }

    return payment;
  }

  private async loadPaymentForProcessing(
    tx: Prisma.TransactionClient,
    paymentId: string,
  ) {
    return tx.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentProcessingInclude(),
    });
  }

  private paymentProcessingInclude() {
    return {
      order: {
        include: {
          outlet: true,
          table: true,
          items: { include: { modifiers: true } },
        },
      },
    } as const;
  }

  private normalizeHitPayStatus(status: string | undefined) {
    const normalized = status?.trim().toLowerCase();
    if (
      !normalized ||
      normalized === 'pending' ||
      normalized === 'processing'
    ) {
      return 'PROCESSING' as const;
    }
    if (normalized === 'completed' || normalized === 'succeeded') {
      return 'SUCCEEDED' as const;
    }
    if (normalized === 'failed') {
      return 'FAILED' as const;
    }
    if (
      normalized === 'canceled' ||
      normalized === 'cancelled' ||
      normalized === 'expired' ||
      normalized === 'inactive'
    ) {
      return 'CANCELLED' as const;
    }
    return 'PROCESSING' as const;
  }

  private primaryHitPayPayment(
    paymentRequest: HitPayPaymentRequest,
  ): HitPayPayment | undefined {
    return paymentRequest.payments?.[0];
  }

  private hitPayFailureReason(
    paymentRequest: HitPayPaymentRequest,
    statusHint?: string,
  ): string {
    const providerPayment = this.primaryHitPayPayment(paymentRequest);
    return (
      providerPayment?.status_reason ||
      providerPayment?.status_reason_code ||
      statusHint ||
      paymentRequest.status ||
      'hitpay_payment_failed'
    );
  }

  private hitPayProviderEventId(eventType: string, paymentRequestId: string) {
    return `payment_request:${eventType}:${paymentRequestId}`;
  }

  private async createWebhookEvent(
    tx: Prisma.TransactionClient,
    providerEventId: string,
    eventType: string,
    payload: HitPayPaymentRequest,
  ) {
    const result = await tx.webhookEvent.createMany({
      data: [
        {
          provider: PaymentProvider.HITPAY,
          providerEventId,
          eventType,
          payloadJson: JSON.parse(
            JSON.stringify(payload),
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

  private async recordIgnoredEvent(
    providerEventId: string,
    eventType: string,
    payload: HitPayPaymentRequest,
  ) {
    const result = await this.prisma.webhookEvent.createMany({
      data: [
        {
          provider: PaymentProvider.HITPAY,
          providerEventId,
          eventType,
          status: WebhookEventStatus.IGNORED,
          payloadJson: JSON.parse(
            JSON.stringify(payload),
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

  private async publishReleaseEvents(
    outletId: string | null,
    orderId: string | null,
    released: boolean,
  ) {
    if (!released || !outletId || !orderId) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { kitchenTickets: true },
    });
    this.operations.publishToOutlet(outletId, 'payment.confirmed', {
      orderId,
      paymentStatus: OrderPaymentStatus.PAID,
    });
    this.operations.publishToOutlet(outletId, 'kitchen.ticket.created', {
      orderId,
      tickets: order?.kitchenTickets ?? [],
    });
  }

  private centsToMajorUnit(cents: number): number {
    return Number((cents / 100).toFixed(2));
  }

  private parseAmountToCents(amount: string | number | undefined): number {
    if (typeof amount === 'number') {
      return Math.round(amount * 100);
    }
    if (!amount) {
      return 0;
    }
    return Math.round(Number(amount) * 100);
  }

  private parseOptionalAmountToCents(
    amount: string | number | undefined,
  ): number | null {
    if (amount === undefined || amount === null || amount === '') {
      return null;
    }
    return this.parseAmountToCents(amount);
  }

  private computeNetAmountCents(
    paymentRequest: HitPayPaymentRequest,
    payment: HitPayPayment | undefined,
  ): number | null {
    const amountCents = this.parseOptionalAmountToCents(paymentRequest.amount);
    const feeCents = this.parseOptionalAmountToCents(payment?.fees);
    if (amountCents === null) {
      return null;
    }
    if (feeCents === null) {
      return amountCents;
    }
    return amountCents - feeCents;
  }

  private isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
