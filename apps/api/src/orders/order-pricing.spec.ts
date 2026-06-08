import { describe, expect, it } from 'vitest';
import { calculateOrderTotals } from './order-pricing';

describe('order pricing', () => {
  it('calculates service charge and GST entirely from server inputs', () => {
    expect(
      calculateOrderTotals({
        lines: [
          {
            quantity: 2,
            unitPriceCents: 650,
            taxable: true,
            serviceChargeable: true,
          },
        ],
        gstEnabled: true,
        gstRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      }),
    ).toEqual({
      subtotalCents: 1300,
      discountTotalCents: 0,
      serviceChargeTotalCents: 130,
      gstTotalCents: 129,
      roundingAdjustmentCents: 0,
      grandTotalCents: 1559,
    });
  });

  it('respects non-taxable and non-service-chargeable lines', () => {
    expect(
      calculateOrderTotals({
        lines: [
          {
            quantity: 1,
            unitPriceCents: 1000,
            taxable: false,
            serviceChargeable: false,
          },
        ],
        gstEnabled: true,
        gstRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      }).grandTotalCents,
    ).toBe(1000);
  });

  it('applies percentage discounts before service charge and GST', () => {
    expect(
      calculateOrderTotals({
        lines: [
          {
            quantity: 2,
            unitPriceCents: 1000,
            taxable: true,
            serviceChargeable: true,
          },
        ],
        gstEnabled: true,
        gstRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
        discount: {
          type: 'PERCENT',
          value: 10,
        },
      }),
    ).toEqual({
      subtotalCents: 2000,
      discountTotalCents: 200,
      serviceChargeTotalCents: 180,
      gstTotalCents: 178,
      roundingAdjustmentCents: 0,
      grandTotalCents: 2158,
    });
  });
});
