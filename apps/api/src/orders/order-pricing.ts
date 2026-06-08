export interface PricedLine {
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  serviceChargeable: boolean;
}

export interface OrderTotals {
  subtotalCents: number;
  discountTotalCents: number;
  serviceChargeTotalCents: number;
  gstTotalCents: number;
  roundingAdjustmentCents: number;
  grandTotalCents: number;
}

export interface OrderDiscountInput {
  type: 'PERCENT' | 'AMOUNT';
  value: number;
}

export function calculateOrderTotals(input: {
  lines: PricedLine[];
  gstEnabled: boolean;
  gstRateBps: number;
  serviceChargeEnabled: boolean;
  serviceChargeBps: number;
  discount?: OrderDiscountInput;
}): OrderTotals {
  const subtotalCents = input.lines.reduce(
    (total, line) => total + line.unitPriceCents * line.quantity,
    0,
  );
  const serviceChargeableCents = input.lines.reduce(
    (total, line) =>
      total +
      (line.serviceChargeable ? line.unitPriceCents * line.quantity : 0),
    0,
  );
  const taxableCents = input.lines.reduce(
    (total, line) =>
      total + (line.taxable ? line.unitPriceCents * line.quantity : 0),
    0,
  );
  const discountTotalCents = calculateDiscountTotal(
    subtotalCents,
    input.discount,
  );
  const discountedSubtotalCents = Math.max(subtotalCents - discountTotalCents, 0);
  const discountFactor =
    subtotalCents > 0 ? discountedSubtotalCents / subtotalCents : 0;
  const discountedServiceChargeableCents = Math.round(
    serviceChargeableCents * discountFactor,
  );
  const discountedTaxableCents = Math.round(taxableCents * discountFactor);
  const serviceChargeTotalCents = input.serviceChargeEnabled
    ? Math.round(
        (discountedServiceChargeableCents * input.serviceChargeBps) / 10_000,
      )
    : 0;
  const gstBaseCents = discountedTaxableCents + serviceChargeTotalCents;
  const gstTotalCents = input.gstEnabled
    ? Math.round((gstBaseCents * input.gstRateBps) / 10_000)
    : 0;

  return {
    subtotalCents,
    discountTotalCents,
    serviceChargeTotalCents,
    gstTotalCents,
    roundingAdjustmentCents: 0,
    grandTotalCents:
      discountedSubtotalCents + serviceChargeTotalCents + gstTotalCents,
  };
}

function calculateDiscountTotal(
  subtotalCents: number,
  discount?: OrderDiscountInput,
): number {
  if (!discount || subtotalCents <= 0) {
    return 0;
  }

  if (discount.type === 'PERCENT') {
    return clampCents(Math.round((subtotalCents * discount.value) / 100), subtotalCents);
  }

  return clampCents(Math.round(discount.value), subtotalCents);
}

function clampCents(value: number, subtotalCents: number): number {
  return Math.max(0, Math.min(value, subtotalCents));
}
