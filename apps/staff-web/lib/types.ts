export interface OutletAccess {
  id: string;
  name: string;
  slug: string;
  role: string;
  permissions: string[];
}

export type PaymentScope =
  | 'ONLINE'
  | 'STRIPE'
  | 'ONLINE_CARD'
  | 'STRIPE_PAYNOW'
  | 'MANUAL_PAYNOW'
  | 'CASH';

export interface StaffSession {
  accessToken: string;
  expiresAt: string;
  expiresInSeconds: number;
  user: {
    id: string;
    companyId: string;
    email: string;
    fullName: string;
    outlets: OutletAccess[];
  };
}

export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'offline';

export interface LoginResponse {
  accessToken: string;
  expiresInSeconds: number;
  user: StaffSession['user'];
}

export interface OutletSummary {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  gstEnabled: boolean;
  gstRateBps: number;
  serviceChargeEnabled: boolean;
  serviceChargeBps: number;
  status: string;
}

export type StaffOrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'SENT_TO_KITCHEN'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderListEntry {
  id: string;
  orderNumber: string;
  status: StaffOrderStatus;
  paymentStatus: string;
  currency: string;
  grandTotalCents: number;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  table: {
    tableCode: string;
    displayName: string;
  } | null;
  payments: Array<{
    method: string;
    status: string;
  }>;
  kitchenTickets: Array<{
    id: string;
    status: string;
    stationId: string;
  }>;
}

export interface OrderDetail extends OrderListEntry {
  source: string;
  serviceType: StaffServiceType;
  subtotalCents: number;
  discountTotalCents: number;
  serviceChargeTotalCents: number;
  gstTotalCents: number;
  roundingAdjustmentCents: number;
  table: {
    id: string;
    tableCode: string;
    displayName: string;
    zone: {
      name: string;
    } | null;
  } | null;
  items: Array<{
    id: string;
    menuItemId: string | null;
    sku: string | null;
    itemName: string;
    variantId: string | null;
    variantName: string | null;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    remarks: string | null;
    modifiers: Array<{
      id: string;
      modifierGroupId: string | null;
      modifierGroupName: string;
      modifierOptionId: string | null;
      modifierOptionName: string;
      priceDeltaCents: number;
    }>;
  }>;
  payments: Array<{
    id: string;
    method: string;
    provider: string;
    status: string;
    amountCents: number;
    providerReference: string | null;
    manualReference: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  kitchenTickets: Array<{
    id: string;
    stationId: string;
    status: string;
    station: {
      id: string;
      key: string;
      name: string;
    } | null;
  }>;
  printJobs: Array<{
    id: string;
    template: string;
    status: string;
    createdAt: string;
    printedAt: string | null;
    lastError: string | null;
    printer: {
      id: string;
      name: string;
      role: string;
    } | null;
  }>;
}

export interface TableZone {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
  tables: Array<{
    id: string;
    tableCode: string;
    displayName: string;
    capacity: number | null;
    shape: string;
    status: string;
    active: boolean;
    qrCodes: Array<{
      id: string;
      publicCode: string;
      destinationPath: string;
      expiresAt: string | null;
      createdAt: string;
      rotatedAt: string | null;
    }>;
  }>;
}

export interface OutletOperationsSummary {
  outlet: OutletSummary;
  totalOrders: number;
  liveQueue: number;
  readyToRun: number;
  settled: number;
  tableCount: number;
  occupiedTables: number;
}

export type MenuChannel = 'QR' | 'POS' | 'BOTH';
export type StaffPaymentMethod = 'ONLINE_CARD' | 'MANUAL_PAYNOW' | 'CASH';
export type StaffOrderSource = 'POS' | 'WAITER';
export type StaffServiceType = 'DINE_IN' | 'TAKEAWAY' | 'PICKUP' | 'COUNTER';

export interface MenuListEntry {
  id: string;
  name: string;
  slug: string;
  channel: MenuChannel;
  isDefault: boolean;
  status: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: string;
    publishedAt: string | null;
    updatedAt: string;
  }>;
}

export interface StaffMenuDetail {
  id: string;
  name: string;
  slug: string;
  channel: MenuChannel;
  isDefault: boolean;
  status: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    publishedAt: string | null;
    updatedAt: string;
    categories: Array<{
      id: string;
      name: string;
      displayOrder: number;
      active: boolean;
      items: Array<{
        id: string;
        sku: string | null;
        name: string;
        description: string | null;
        basePriceCents: number;
        taxable: boolean;
        serviceChargeable: boolean;
        preparationStationKey: string;
        active: boolean;
        soldOut: boolean;
        displayOrder: number;
        variants: Array<{
          id: string;
          name: string;
          sku: string | null;
          priceDeltaCents: number;
          active: boolean;
          displayOrder: number;
        }>;
        itemModifierGroups: Array<{
          id: string;
          displayOrder: number;
          modifierGroup: {
            id: string;
            key: string;
            name: string;
            minSelect: number;
            maxSelect: number;
            required: boolean;
            displayOrder: number;
            options: Array<{
              id: string;
              name: string;
              priceDeltaCents: number;
              active: boolean;
              displayOrder: number;
            }>;
          };
        }>;
      }>;
    }>;
    modifierGroups: Array<{
      id: string;
      key: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      required: boolean;
      displayOrder: number;
      options: Array<{
        id: string;
        name: string;
        priceDeltaCents: number;
        active: boolean;
        displayOrder: number;
      }>;
    }>;
  }>;
}

export interface CreateStaffOrderInput {
  menuId: string;
  source: StaffOrderSource;
  serviceType: StaffServiceType;
  paymentMethod: StaffPaymentMethod;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    menuItemId: string;
    variantId?: string;
    quantity: number;
    modifierOptionIds?: string[];
    remarks?: string;
  }>;
}

export interface CheckoutSessionResponse {
  paymentId: string;
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  status: string;
  method: StaffPaymentMethod;
  amountCents: number;
  currency: string;
}

export interface PaymentSettingsResponse {
  online: {
    configuredEnabled: boolean;
    disabledUntil: string | null;
    reason: string | null;
  };
  stripe: {
    configuredEnabled: boolean;
    disabledUntil: string | null;
    reason: string | null;
  };
  methods: Array<{
    method: PaymentScope;
    configuredEnabled: boolean;
    disabledUntil: string | null;
    reason: string | null;
    effectiveEnabled: boolean;
  }>;
  version: number;
  updatedAt: string;
}
