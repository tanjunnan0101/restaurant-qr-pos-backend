import type { StripeCheckoutSession } from './stripe.gateway';

export type CheckoutEventAction =
  | 'SUCCEEDED'
  | 'PROCESSING'
  | 'FAILED'
  | 'CANCELLED'
  | 'IGNORED';

export function checkoutEventAction(
  eventType: string,
  session: StripeCheckoutSession,
): CheckoutEventAction {
  if (
    eventType === 'checkout.session.async_payment_succeeded' ||
    (eventType === 'checkout.session.completed' &&
      session.payment_status === 'paid')
  ) {
    return 'SUCCEEDED';
  }
  if (eventType === 'checkout.session.completed') {
    return 'PROCESSING';
  }
  if (eventType === 'checkout.session.async_payment_failed') {
    return 'FAILED';
  }
  if (eventType === 'checkout.session.expired') {
    return 'CANCELLED';
  }
  return 'IGNORED';
}

export function stripeObjectId(
  value: string | { id: string } | null,
): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}
