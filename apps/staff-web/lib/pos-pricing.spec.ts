import { describe, expect, it } from 'vitest';
import type { StaffMenuDetail } from './types';
import {
  buildPosCartLine,
  calculatePosTotals,
  itemNeedsCustomization,
  pickPublishedVersion,
  validateModifierSelections,
} from './pos-pricing';

type MenuItemDetail =
  StaffMenuDetail['versions'][number]['categories'][number]['items'][number];

function makeItem(overrides: Partial<MenuItemDetail> = {}): MenuItemDetail {
  return {
    id: 'item-1',
    sku: null,
    name: 'Latte',
    description: null,
    basePriceCents: 500,
    taxable: true,
    serviceChargeable: true,
    preparationStationKey: 'bar',
    active: true,
    soldOut: false,
    displayOrder: 0,
    variants: [],
    itemModifierGroups: [],
    ...overrides,
  };
}

describe('pos pricing', () => {
  it('calculates totals matching outlet tax and service-charge rules', () => {
    const totals = calculatePosTotals(
      [
        {
          id: 'a',
          menuItemId: 'item-1',
          itemName: 'Latte',
          variantId: undefined,
          variantName: undefined,
          quantity: 2,
          remarks: '',
          modifierOptionIds: [],
          modifierLabels: [],
          taxable: true,
          serviceChargeable: true,
          unitPriceCents: 650,
          lineTotalCents: 1300,
        },
      ],
      {
        gstEnabled: true,
        gstRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      },
    );

    expect(totals).toEqual({
      subtotalCents: 1300,
      discountTotalCents: 0,
      serviceChargeTotalCents: 130,
      gstTotalCents: 129,
      grandTotalCents: 1559,
    });
  });

  it('skips service charge and GST for non-chargeable lines', () => {
    const totals = calculatePosTotals(
      [
        {
          id: 'a',
          menuItemId: 'item-1',
          itemName: 'Water',
          variantId: undefined,
          variantName: undefined,
          quantity: 1,
          remarks: '',
          modifierOptionIds: [],
          modifierLabels: [],
          taxable: false,
          serviceChargeable: false,
          unitPriceCents: 1000,
          lineTotalCents: 1000,
        },
      ],
      {
        gstEnabled: true,
        gstRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      },
    );

    expect(totals).toEqual({
      subtotalCents: 1000,
      discountTotalCents: 0,
      serviceChargeTotalCents: 0,
      gstTotalCents: 0,
      grandTotalCents: 1000,
    });
  });

  it('applies order-level discounts before service charge and GST', () => {
    const totals = calculatePosTotals(
      [
        {
          id: 'a',
          menuItemId: 'item-1',
          itemName: 'Latte',
          variantId: undefined,
          variantName: undefined,
          quantity: 2,
          remarks: '',
          modifierOptionIds: [],
          modifierLabels: [],
          taxable: true,
          serviceChargeable: true,
          unitPriceCents: 1000,
          lineTotalCents: 2000,
        },
      ],
      {
        gstEnabled: true,
        gstRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      },
      {
        type: 'PERCENT',
        value: 10,
      },
    );

    expect(totals).toEqual({
      subtotalCents: 2000,
      discountTotalCents: 200,
      serviceChargeTotalCents: 180,
      gstTotalCents: 178,
      grandTotalCents: 2158,
    });
  });

  it('builds a priced cart line with variant and modifier deltas', () => {
    const item = makeItem({
      variants: [
        {
          id: 'var-large',
          name: 'Large',
          sku: null,
          priceDeltaCents: 150,
          active: true,
          displayOrder: 0,
        },
      ],
      itemModifierGroups: [
        {
          id: 'link-1',
          displayOrder: 0,
          modifierGroup: {
            id: 'group-1',
            key: 'milk',
            name: 'Milk',
            minSelect: 0,
            maxSelect: 1,
            required: false,
            displayOrder: 0,
            options: [
              {
                id: 'opt-oat',
                name: 'Oat',
                priceDeltaCents: 100,
                active: true,
                displayOrder: 0,
              },
            ],
          },
        },
      ],
    });

    const line = buildPosCartLine({
      id: 'cart-1',
      item,
      variantId: 'var-large',
      selectedOptionIdsByGroup: { 'group-1': ['opt-oat'] },
      quantity: 2,
      remarks: 'Less ice',
    });

    expect(line.unitPriceCents).toBe(750);
    expect(line.lineTotalCents).toBe(1500);
    expect(line.variantName).toBe('Large');
    expect(line.modifierLabels).toEqual(['Oat']);
  });

  it('flags modifier selections that violate min/max rules', () => {
    const item = makeItem({
      itemModifierGroups: [
        {
          id: 'link-1',
          displayOrder: 0,
          modifierGroup: {
            id: 'group-1',
            key: 'size',
            name: 'Size',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            displayOrder: 0,
            options: [
              {
                id: 'opt-s',
                name: 'Small',
                priceDeltaCents: 0,
                active: true,
                displayOrder: 0,
              },
            ],
          },
        },
      ],
    });

    const issues = validateModifierSelections(item.itemModifierGroups, {});
    expect(issues).toHaveLength(1);
    expect(issues[0]?.groupName).toBe('Size');
  });

  it('detects when customization UI is required', () => {
    expect(itemNeedsCustomization(makeItem())).toBe(false);
    expect(
      itemNeedsCustomization(
        makeItem({
          variants: [
            {
              id: 'var-1',
              name: 'Large',
              sku: null,
              priceDeltaCents: 100,
              active: true,
              displayOrder: 0,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('finds the published menu version', () => {
    expect(
      pickPublishedVersion({
        versions: [{ status: 'DRAFT' }, { status: 'PUBLISHED' }],
      }),
    ).toEqual({ status: 'PUBLISHED' });
    expect(pickPublishedVersion({ versions: [{ status: 'DRAFT' }] })).toBeNull();
  });
});
