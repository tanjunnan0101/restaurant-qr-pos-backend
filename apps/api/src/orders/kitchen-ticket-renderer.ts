interface TicketModifier {
  modifierOptionName: string;
}

interface TicketItem {
  itemName: string;
  variantName: string | null;
  quantity: number;
  remarks: string | null;
  modifiers: TicketModifier[];
}

export function renderKitchenTicket(input: {
  outletName: string;
  stationName: string;
  orderNumber: string;
  tableName: string;
  createdAt: Date;
  items: TicketItem[];
}): string {
  const lines = [
    input.outletName.toUpperCase(),
    input.stationName.toUpperCase(),
    '================================',
    `ORDER ${input.orderNumber}`,
    `TABLE ${input.tableName}`,
    input.createdAt.toISOString(),
    '--------------------------------',
  ];

  for (const item of input.items) {
    lines.push(`${item.quantity} x ${item.itemName}`);
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

  lines.push('================================', '');
  return lines.join('\n');
}
