import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type StripeClient = Stripe.Stripe;
export type StripeEvent = ReturnType<
  Stripe.Stripe['webhooks']['constructEvent']
>;
export type StripeCheckoutSession = Awaited<
  ReturnType<Stripe.Stripe['checkout']['sessions']['create']>
>;
export type StripeCheckoutSessionCreateParams = Parameters<
  Stripe.Stripe['checkout']['sessions']['create']
>[0];

@Injectable()
export class StripeGateway {
  private readonly stripe: Stripe.Stripe;
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    this.secretKey = config.get<string>('STRIPE_SECRET_KEY') ?? '';
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    const host = config.get<string>('STRIPE_API_HOST');
    const port = config.get<string>('STRIPE_API_PORT');
    const protocol = config.get<'http' | 'https'>('STRIPE_API_PROTOCOL');
    this.stripe = new Stripe(this.secretKey || 'sk_test_not_configured', {
      ...(host ? { host } : {}),
      ...(port ? { port } : {}),
      ...(protocol ? { protocol } : {}),
    });
  }

  createCheckoutSession(
    params: StripeCheckoutSessionCreateParams,
    idempotencyKey: string,
  ): Promise<StripeCheckoutSession> {
    this.assertApiConfigured();
    return this.stripe.checkout.sessions.create(params, {
      idempotencyKey,
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): StripeEvent {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook processing is not configured.',
      );
    }
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }

  private assertApiConfigured(): void {
    if (!this.secretKey) {
      throw new ServiceUnavailableException(
        'Stripe payment creation is not configured.',
      );
    }
  }
}
