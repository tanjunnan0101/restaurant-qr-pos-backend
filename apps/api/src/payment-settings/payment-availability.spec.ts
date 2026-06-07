import { PaymentMethod } from '@restaurant-pos/db';
import { describe, expect, it } from 'vitest';
import {
  evaluatePaymentAvailability,
  isToggleEffective,
} from './payment-availability';

describe('payment availability', () => {
  const now = new Date('2026-06-06T12:00:00.000Z');

  it('automatically becomes effective after a temporary shutdown expires', () => {
    expect(
      isToggleEffective(
        {
          enabled: true,
          disabledUntil: new Date('2026-06-06T11:59:59.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('allows only the hosted card checkout method', () => {
    const result = evaluatePaymentAvailability({
      now,
      online: { enabled: true, disabledUntil: null },
      stripe: { enabled: true, disabledUntil: null },
      methods: [
        {
          method: PaymentMethod.STRIPE_CARD,
          enabled: true,
          disabledUntil: null,
        },
        {
          method: PaymentMethod.STRIPE_PAYNOW,
          enabled: false,
          disabledUntil: null,
        },
        {
          method: PaymentMethod.MANUAL_PAYNOW,
          enabled: true,
          disabledUntil: null,
        },
      ],
    });

    expect(result.STRIPE_CARD).toBe(true);
    expect(result.STRIPE_PAYNOW).toBe(false);
    expect(result.MANUAL_PAYNOW).toBe(false);
  });

  it('blocks the hosted checkout method when the provider master switch is off', () => {
    const result = evaluatePaymentAvailability({
      now,
      online: { enabled: true, disabledUntil: null },
      stripe: { enabled: false, disabledUntil: null },
      methods: [
        {
          method: PaymentMethod.STRIPE_CARD,
          enabled: true,
          disabledUntil: null,
        },
        {
          method: PaymentMethod.STRIPE_PAYNOW,
          enabled: true,
          disabledUntil: null,
        },
        {
          method: PaymentMethod.MANUAL_PAYNOW,
          enabled: true,
          disabledUntil: null,
        },
      ],
    });

    expect(result.STRIPE_CARD).toBe(false);
    expect(result.STRIPE_PAYNOW).toBe(false);
    expect(result.MANUAL_PAYNOW).toBe(false);
  });
});
