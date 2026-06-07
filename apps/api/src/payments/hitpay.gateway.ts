import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface HitPayPayment {
  id?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  fees?: number | string;
  status_reason?: string;
  status_reason_code?: string;
}

export interface HitPayPaymentRequest {
  id: string;
  amount: number | string;
  currency: string;
  status: string;
  purpose?: string;
  reference_number?: string | null;
  payment_methods?: string[];
  url?: string;
  redirect_url?: string;
  expiry_date?: string | null;
  payments?: HitPayPayment[];
}

interface CreateHitPayPaymentRequestInput {
  amount: number;
  currency: string;
  paymentMethods: string[];
  purpose: string;
  referenceNumber: string;
  redirectUrl: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class HitPayGateway {
  private readonly apiKey: string;
  private readonly webhookSalt: string;
  private readonly apiUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>('HITPAY_API_KEY') ?? '';
    this.webhookSalt = config.get<string>('HITPAY_WEBHOOK_SALT') ?? '';
    this.apiUrl = (config.get<string>('HITPAY_API_URL') ?? '').replace(
      /\/$/,
      '',
    );
  }

  async createPaymentRequest(
    input: CreateHitPayPaymentRequestInput,
  ): Promise<HitPayPaymentRequest> {
    this.assertApiKey();
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/v1/payment-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BUSINESS-API-KEY': this.apiKey,
        },
        body: JSON.stringify({
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          payment_methods: input.paymentMethods,
          purpose: input.purpose,
          reference_number: input.referenceNumber,
          redirect_url: input.redirectUrl,
          send_email: false,
          send_sms: false,
          metadata: input.metadata,
        }),
      });
    } catch (error) {
      throw new BadGatewayException(
        `HitPay request failed before a response was received: ${
          error instanceof Error ? error.message : 'Unknown fetch error'
        }.`,
      );
    }

    return this.parseResponse(response, 'create a HitPay payment request');
  }

  async getPaymentRequest(requestId: string): Promise<HitPayPaymentRequest> {
    this.assertApiKey();
    let response: Response;
    try {
      response = await fetch(
        `${this.apiUrl}/v1/payment-requests/${encodeURIComponent(requestId)}`,
        {
          method: 'GET',
          headers: {
            'X-BUSINESS-API-KEY': this.apiKey,
          },
        },
      );
    } catch (error) {
      throw new BadGatewayException(
        `HitPay status lookup failed before a response was received: ${
          error instanceof Error ? error.message : 'Unknown fetch error'
        }.`,
      );
    }

    return this.parseResponse(response, 'load a HitPay payment request');
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): void {
    if (!signature) {
      throw new Error('HitPay webhook signature is missing.');
    }
    if (!this.webhookSalt) {
      throw new Error('HitPay webhook salt is not configured.');
    }

    const expected = createHmac('sha256', this.webhookSalt)
      .update(rawBody)
      .digest('hex');
    const actual = signature.trim().toLowerCase();
    if (expected.length !== actual.length) {
      throw new Error('HitPay webhook signature length does not match.');
    }

    const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    if (!valid) {
      throw new Error('HitPay webhook signature does not match.');
    }
  }

  private assertApiKey(): void {
    if (!this.apiKey) {
      throw new BadGatewayException(
        'HitPay is not configured. Set HITPAY_API_KEY before starting checkout.',
      );
    }
  }

  private async parseResponse(
    response: Response,
    action: string,
  ): Promise<HitPayPaymentRequest> {
    const payload = await response
      .json()
      .catch(async () => ({ message: await response.text().catch(() => '') }));

    if (!response.ok) {
      const message = this.extractErrorMessage(payload);
      throw new BadGatewayException(
        `HitPay could not ${action}: ${message || response.statusText}.`,
      );
    }

    return payload as HitPayPaymentRequest;
  }

  private extractErrorMessage(payload: unknown): string | null {
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) {
      return error;
    }
    if (error && typeof error === 'object') {
      const nested = (error as { message?: unknown }).message;
      if (typeof nested === 'string' && nested.trim()) {
        return nested;
      }
    }
    return null;
  }
}
