import { describe, expect, it } from 'vitest';
import { checkoutEventAction, stripeObjectId } from './stripe-checkout-event';
import type { StripeCheckoutSession } from './stripe.gateway';

function session(
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required',
): StripeCheckoutSession {
  return { payment_status: paymentStatus } as StripeCheckoutSession;
}

describe('Stripe Checkout event classification', () => {
  it('releases an immediately paid Checkout session', () => {
    expect(
      checkoutEventAction('checkout.session.completed', session('paid')),
    ).toBe('SUCCEEDED');
  });

  it('keeps an unpaid completed session processing', () => {
    expect(
      checkoutEventAction('checkout.session.completed', session('unpaid')),
    ).toBe('PROCESSING');
  });

  it('supports asynchronous success and failure events', () => {
    expect(
      checkoutEventAction(
        'checkout.session.async_payment_succeeded',
        session('paid'),
      ),
    ).toBe('SUCCEEDED');
    expect(
      checkoutEventAction(
        'checkout.session.async_payment_failed',
        session('unpaid'),
      ),
    ).toBe('FAILED');
  });

  it('normalizes expandable Stripe object identifiers', () => {
    expect(stripeObjectId('pi_123')).toBe('pi_123');
    expect(stripeObjectId({ id: 'pi_456' })).toBe('pi_456');
    expect(stripeObjectId(null)).toBeNull();
  });
});
