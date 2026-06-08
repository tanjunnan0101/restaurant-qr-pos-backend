import type { StaffMenuDetail } from './types';

export type PosMenuItem =
  StaffMenuDetail['versions'][number]['categories'][number]['items'][number];
type PosMenuVariant = PosMenuItem['variants'][number];
type ItemModifierGroupLink = PosMenuItem['itemModifierGroups'][number];

export interface PosCartLine {
  id: string;
  menuItemId: string;
  itemName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  remarks?: string;
  modifierOptionIds: string[];
  modifierLabels: string[];
  taxable: boolean;
  serviceChargeable: boolean;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface PosTotals {
  subtotalCents: number;
  discountTotalCents: number;
  serviceChargeTotalCents: number;
  gstTotalCents: number;
  grandTotalCents: number;
}

export function calculatePosTotals(
  lines: PosCartLine[],
  outlet: {
    gstEnabled: boolean;
    gstRateBps: number;
    serviceChargeEnabled: boolean;
    serviceChargeBps: number;
  },
  discount?: {
    type: 'PERCENT' | 'AMOUNT';
    value: number;
  },
): PosTotals {
  const subtotalCents = lines.reduce(
    (total, line) => total + line.unitPriceCents * line.quantity,
    0,
  );
  const serviceChargeableCents = lines.reduce(
    (total, line) =>
      total +
      (line.serviceChargeable ? line.unitPriceCents * line.quantity : 0),
    0,
  );
  const taxableCents = lines.reduce(
    (total, line) =>
      total + (line.taxable ? line.unitPriceCents * line.quantity : 0),
    0,
  );
  const discountTotalCents = calculateDiscountTotal(subtotalCents, discount);
  const discountedSubtotalCents = Math.max(subtotalCents - discountTotalCents, 0);
  const discountFactor =
    subtotalCents > 0 ? discountedSubtotalCents / subtotalCents : 0;
  const discountedServiceChargeableCents = Math.round(
    serviceChargeableCents * discountFactor,
  );
  const discountedTaxableCents = Math.round(taxableCents * discountFactor);
  const serviceChargeTotalCents = outlet.serviceChargeEnabled
    ? Math.round(
        (discountedServiceChargeableCents * outlet.serviceChargeBps) / 10_000,
      )
    : 0;
  const gstBaseCents = discountedTaxableCents + serviceChargeTotalCents;
  const gstTotalCents = outlet.gstEnabled
    ? Math.round((gstBaseCents * outlet.gstRateBps) / 10_000)
    : 0;

  return {
    subtotalCents,
    discountTotalCents,
    serviceChargeTotalCents,
    gstTotalCents,
    grandTotalCents:
      discountedSubtotalCents + serviceChargeTotalCents + gstTotalCents,
  };
}

export function buildPosCartLine(input: {
  id: string;
  item: PosMenuItem;
  variantId?: string;
  selectedOptionIdsByGroup: Record<string, string[]>;
  quantity: number;
  remarks: string;
}): PosCartLine {
  const variant =
    input.item.variants.find(
      (entry) => entry.id === input.variantId && entry.active,
    ) ?? null;
  const selectedOptions = resolveSelectedOptions(
    input.item.itemModifierGroups,
    input.selectedOptionIdsByGroup,
  );
  const modifierTotal = selectedOptions.reduce(
    (sum, option) => sum + option.priceDeltaCents,
    0,
  );
  const unitPriceCents =
    input.item.basePriceCents + (variant?.priceDeltaCents ?? 0) + modifierTotal;

  return {
    id: input.id,
    menuItemId: input.item.id,
    itemName: input.item.name,
    variantId: variant?.id,
    variantName: variant?.name,
    quantity: input.quantity,
    remarks: input.remarks.trim(),
    modifierOptionIds: selectedOptions.map((option) => option.id),
    modifierLabels: selectedOptions.map((option) => option.name),
    taxable: input.item.taxable,
    serviceChargeable: input.item.serviceChargeable,
    unitPriceCents,
    lineTotalCents: unitPriceCents * input.quantity,
  };
}

export interface ModifierSelectionIssue {
  groupId: string;
  groupName: string;
  message: string;
}

export function validateModifierSelections(
  itemModifierGroups: ItemModifierGroupLink[],
  selected: Record<string, string[]>,
): ModifierSelectionIssue[] {
  const issues: ModifierSelectionIssue[] = [];
  for (const entry of itemModifierGroups) {
    const group = entry.modifierGroup;
    const count = selected[group.id]?.length ?? 0;
    if (count < group.minSelect || count > group.maxSelect) {
      issues.push({
        groupId: group.id,
        groupName: group.name,
        message:
          group.minSelect === group.maxSelect
            ? `Choose ${group.minSelect} from ${group.name}.`
            : `Choose ${group.minSelect}-${group.maxSelect} from ${group.name}.`,
      });
    }
  }
  return issues;
}

export function itemNeedsCustomization(item: PosMenuItem): boolean {
  if (item.variants.some((variant) => variant.active)) {
    return true;
  }
  return item.itemModifierGroups.length > 0;
}

export function pickPublishedVersion<T extends { status: string }>(menu: {
  versions: T[];
}): T | null {
  return menu.versions.find((version) => version.status === 'PUBLISHED') ?? null;
}

function resolveSelectedOptions(
  itemModifierGroups: ItemModifierGroupLink[],
  selectedByGroup: Record<string, string[]>,
) {
  return itemModifierGroups.flatMap((entry) => {
    const selected = selectedByGroup[entry.modifierGroup.id] ?? [];
    return entry.modifierGroup.options.filter(
      (option) => option.active && selected.includes(option.id),
    );
  });
}

function calculateDiscountTotal(
  subtotalCents: number,
  discount?:
    | {
        type: 'PERCENT' | 'AMOUNT';
        value: number;
      }
    | undefined,
): number {
  if (!discount || subtotalCents <= 0) {
    return 0;
  }

  const rawDiscount =
    discount.type === 'PERCENT'
      ? Math.round((subtotalCents * discount.value) / 100)
      : Math.round(discount.value);

  return Math.max(0, Math.min(rawDiscount, subtotalCents));
}
