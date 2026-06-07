import { describe, expect, it } from 'vitest';
import { renderCustomerReceipt } from './customer-receipt-renderer';

describe('renderCustomerReceipt', () => {
  it('includes item lines and totals', () => {
    const output = renderCustomerReceipt({
      outletName: 'Main Outlet',
      orderNumber: '20260608-0001',
      tableName: 'Table 1',
      createdAt: new Date('2026-06-08T12:00:00.000Z'),
      currency: 'SGD',
      subtotalCents: 1000,
      serviceChargeTotalCents: 100,
      gstTotalCents: 99,
      roundingAdjustmentCents: 0,
      grandTotalCents: 1199,
      items: [
        {
          itemName: 'Signature Noodles',
          variantName: 'Normal',
          quantity: 2,
          lineTotalCents: 1000,
          remarks: 'Less spicy',
          modifiers: [{ modifierOptionName: 'Egg' }],
        },
      ],
    });

    expect(output).toContain('CUSTOMER RECEIPT');
    expect(output).toContain('2 x Signature Noodles');
    expect(output).toContain('SUBTOTAL');
    expect(output).toContain('TOTAL');
    expect(output).toContain('PAID VIA ONLINE CHECKOUT');
  });
});
