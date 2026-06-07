interface ReceiptModifier {
  modifierOptionName: string;
}

interface ReceiptItem {
  itemName: string;
  variantName: string | null;
  quantity: number;
  lineTotalCents: number;
  remarks: string | null;
  modifiers: ReceiptModifier[];
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function renderCustomerReceipt(input: {
  outletName: string;
  orderNumber: string;
  tableName: string;
  createdAt: Date;
  currency: string;
  subtotalCents: number;
  serviceChargeTotalCents: number;
  gstTotalCents: number;
  roundingAdjustmentCents: number;
  grandTotalCents: number;
  items: ReceiptItem[];
}): string {
  const lines = [
    input.outletName.toUpperCase(),
    'CUSTOMER RECEIPT',
    '================================',
    `ORDER ${input.orderNumber}`,
    `TABLE ${input.tableName}`,
    input.createdAt.toISOString(),
    '--------------------------------',
  ];

  for (const item of input.items) {
    lines.push(
      `${item.quantity} x ${item.itemName} ${formatMoney(
        item.lineTotalCents,
        input.currency,
      )}`,
    );
    if (item.variantName) {
      lines.push(`  ${item.variantName}`);
    }
    for (const modifier of item.modifiers) {
      lines.push(`  + ${modifier.modifierOptionName}`);
    }
    if (item.remarks) {
      lines.push(`  NOTE: ${item.remarks}`);
    }
  }

  lines.push('--------------------------------');
  lines.push(`SUBTOTAL ${formatMoney(input.subtotalCents, input.currency)}`);
  if (input.serviceChargeTotalCents > 0) {
    lines.push(
      `SERVICE CHARGE ${formatMoney(
        input.serviceChargeTotalCents,
        input.currency,
      )}`,
    );
  }
  if (input.gstTotalCents > 0) {
    lines.push(`GST ${formatMoney(input.gstTotalCents, input.currency)}`);
  }
  if (input.roundingAdjustmentCents !== 0) {
    lines.push(
      `ROUNDING ${formatMoney(input.roundingAdjustmentCents, input.currency)}`,
    );
  }
  lines.push(`TOTAL ${formatMoney(input.grandTotalCents, input.currency)}`);
  lines.push(
    '================================',
    'PAID VIA ONLINE CHECKOUT',
    '',
  );
  return lines.join('\n');
}
