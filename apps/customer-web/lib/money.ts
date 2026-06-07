import type { CartItem, PublicQrResponse } from './types';

export function formatMoney(cents: number, currency = 'SGD') {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function calculateCartTotals(
  cart: CartItem[],
  outlet: PublicQrResponse['outlet'],
) {
  const subtotalCents = cart.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const serviceChargeableCents = cart.reduce(
    (sum, item) =>
      sum + (item.serviceChargeable ? item.unitPriceCents * item.quantity : 0),
    0,
  );
  const taxableCents = cart.reduce(
    (sum, item) =>
      sum + (item.taxable ? item.unitPriceCents * item.quantity : 0),
    0,
  );
  const serviceChargeCents = outlet.serviceChargeEnabled
    ? Math.round((serviceChargeableCents * outlet.serviceChargeBps) / 10_000)
    : 0;
  const gstCents = outlet.gstEnabled
    ? Math.round(
        ((taxableCents + serviceChargeCents) * outlet.gstRateBps) / 10_000,
      )
    : 0;
  return {
    subtotalCents,
    serviceChargeCents,
    gstCents,
    totalCents: subtotalCents + serviceChargeCents + gstCents,
  };
}
