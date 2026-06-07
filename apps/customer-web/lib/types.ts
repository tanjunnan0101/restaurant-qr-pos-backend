export type PaymentMethod = 'STRIPE_CARD' | 'STRIPE_PAYNOW' | 'MANUAL_PAYNOW';

export interface ModifierOption {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  taxable: boolean;
  serviceChargeable: boolean;
  soldOut: boolean;
  variants: Array<{
    id: string;
    name: string;
    priceDeltaCents: number;
  }>;
  itemModifierGroups: Array<{
    displayOrder: number;
    modifierGroup: ModifierGroup;
  }>;
}

export interface PublicQrResponse {
  outlet: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    gstEnabled: boolean;
    gstRateBps: number;
    serviceChargeEnabled: boolean;
    serviceChargeBps: number;
  };
  table: {
    id: string;
    code: string;
    name: string;
    capacity: number | null;
    zone: string;
  };
  menu: {
    id: string;
    name: string;
    slug: string;
    version: {
      id: string;
      versionNumber: number;
      categories: Array<{
        id: string;
        name: string;
        items: MenuItem[];
      }>;
    } | null;
  } | null;
  paymentAvailability: Partial<Record<PaymentMethod, boolean>>;
}

export interface CartItem {
  cartId: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  variantId?: string;
  variantName?: string;
  modifierOptionIds: string[];
  modifierNames: string[];
  remarks?: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  serviceChargeable: boolean;
}

export interface PublicOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalCents: number;
  discountTotalCents: number;
  serviceChargeTotalCents: number;
  gstTotalCents: number;
  roundingAdjustmentCents: number;
  grandTotalCents: number;
  items: Array<{
    id: string;
    itemName: string;
    variantName: string | null;
    quantity: number;
    lineTotalCents: number;
    modifiers: Array<{ modifierOptionName: string }>;
  }>;
}

export interface CheckoutResponse {
  paymentId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  expiresAt: string;
  status: string;
  method: PaymentMethod;
  amountCents: number;
  currency: string;
}
