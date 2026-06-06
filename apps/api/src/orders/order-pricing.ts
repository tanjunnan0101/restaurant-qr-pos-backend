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

export function calculateOrderTotals(input: {
  lines: PricedLine[];
  gstEnabled: boolean;
  gstRateBps: number;
  serviceChargeEnabled: boolean;
  serviceChargeBps: number;
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
  const serviceChargeTotalCents = input.serviceChargeEnabled
    ? Math.round((serviceChargeableCents * input.serviceChargeBps) / 10_000)
    : 0;
  const gstBaseCents = taxableCents + serviceChargeTotalCents;
  const gstTotalCents = input.gstEnabled
    ? Math.round((gstBaseCents * input.gstRateBps) / 10_000)
    : 0;

  return {
    subtotalCents,
    discountTotalCents: 0,
    serviceChargeTotalCents,
    gstTotalCents,
    roundingAdjustmentCents: 0,
    grandTotalCents: subtotalCents + serviceChargeTotalCents + gstTotalCents,
  };
}
