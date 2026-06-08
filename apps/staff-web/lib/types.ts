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
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'SENT_TO_KITCHEN'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type DiningTableStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'RESERVED'
  | 'OUT_OF_SERVICE'
  | 'INACTIVE';

export interface ServiceRequestSummary {
  id: string;
  type: 'CALL_STAFF' | 'REQUEST_BILL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
  note: string | null;
  requestedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

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
    id: string;
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
    status: DiningTableStatus;
    active: boolean;
    qrCodes: Array<{
      id: string;
      publicCode: string;
      destinationPath: string;
      expiresAt: string | null;
      createdAt: string;
      rotatedAt: string | null;
    }>;
    serviceRequests: ServiceRequestSummary[];
  }>;
}

export interface OutletOperationsSummary {
  outlet: OutletSummary;
  totalOrders: number;
  liveQueue: number;
  readyToRun: number;
  settled: number;
  tableCount: number;
  availableTables: number;
  occupiedTables: number;
  reservedTables: number;
  outOfServiceTables: number;
  tablesWithoutQr: number;
  openServiceRequests: number;
  attentionScore: number;
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

export interface MenuItemAvailabilityResponse {
  id: string;
  soldOut: boolean;
}

export interface AssignableStaffRole {
  id: string;
  systemKey: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface OutletStaffUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  lastLoginAt: string | null;
  role: {
    id: string;
    systemKey: string;
    name: string;
    permissions: string[];
  };
  activation: {
    pending: boolean;
    expiresAt: string | null;
  };
}

export interface OutletStaffListResponse {
  users: OutletStaffUser[];
}

export interface AssignableStaffRolesResponse {
  roles: AssignableStaffRole[];
}

export interface StaffUserMutationResponse {
  id?: string;
  userId?: string;
  email?: string;
  fullName?: string;
  status?: string;
  role?: {
    id: string;
    systemKey: string;
    name: string;
    permissions: string[];
  };
  activation?: {
    pending?: boolean;
    expiresAt: string | null;
    token: string | null;
    url: string | null;
  };
  removed?: boolean;
}

export interface OutletAuditLogEntry {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  requestId: string | null;
  ipAddress: string | null;
  createdAt: string;
  actor: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  before: unknown;
  after: unknown;
  outlet: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface OutletAuditLogListResponse {
  entries: OutletAuditLogEntry[];
}

export interface CreateStaffOrderInput {
  menuId: string;
  source: StaffOrderSource;
  serviceType: StaffServiceType;
  paymentMethod?: StaffPaymentMethod;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  saveAsDraft?: boolean;
  discount?: {
    type: 'PERCENT' | 'AMOUNT';
    value: number;
    reason?: string;
  };
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

export interface KitchenStationSummary {
  id: string;
  key: string;
  name: string;
  displayOrder: number;
  active: boolean;
}

export interface OutletPrintingSettingsResponse {
  stations: KitchenStationSummary[];
}

export interface OutletPrintingOperationsResponse {
  stations: Array<{
    id: string;
    key: string;
    name: string;
    displayOrder: number;
    active: boolean;
    printerRoute: {
      id: string;
      primaryPrinter: {
        id: string;
        key: string;
        name: string;
        role: string;
        active: boolean;
      } | null;
      backupPrinter: {
        id: string;
        key: string;
        name: string;
        role: string;
        active: boolean;
      } | null;
    } | null;
  }>;
  printers: Array<{
    id: string;
    key: string;
    name: string;
    connectionType: string;
    role: string;
    host: string | null;
    port: number | null;
    paperWidthMm: number;
    autoCut: boolean;
    buzzer: boolean;
    cashDrawer: boolean;
    active: boolean;
    healthStatus: string;
    lastHeartbeatAt: string | null;
  }>;
  agents: Array<{
    id: string;
    deviceId: string;
    name: string;
    active: boolean;
    appVersion: string | null;
    lastIpAddress: string | null;
    lastHeartbeatAt: string | null;
    createdAt: string;
  }>;
  failedJobs: Array<{
    id: string;
    orderId: string | null;
    kitchenTicketId: string | null;
    printerId: string | null;
    template: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    printedAt: string | null;
    nextAttemptAt: string | null;
    lastError: string | null;
    reprintOfId: string | null;
    printer: {
      id: string;
      name: string;
      role: string;
    } | null;
  }>;
}

export interface PrintJobActionResponse {
  id: string;
  template: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  printedAt: string | null;
  lastError: string | null;
}

export interface PrintingSetupPayload {
  stations: Array<{
    key: string;
    name: string;
    displayOrder?: number;
    active?: boolean;
  }>;
  printers: Array<{
    key: string;
    name: string;
    connectionType: string;
    role: string;
    host?: string;
    port?: number;
    paperWidthMm?: number;
    autoCut?: boolean;
    buzzer?: boolean;
    cashDrawer?: boolean;
    active?: boolean;
  }>;
  routes: Array<{
    stationKey: string;
    primaryPrinterKey: string;
    backupPrinterKey?: string;
  }>;
  agent?: {
    deviceId: string;
    name: string;
    rotateKey?: boolean;
  };
}

export interface PrintingSetupResponse {
  configuration: OutletPrintingOperationsResponse;
  agent: {
    id: string;
    key: string | null;
    note: string;
  } | null;
}

export interface DiningTableStatusUpdateResponse {
  id: string;
  zoneId: string;
  tableCode: string;
  displayName: string;
  status: DiningTableStatus;
  active: boolean;
}

export interface RotateTableQrResponse {
  tableId: string;
  publicCode: string;
  qrUrl: string;
  note: string;
}

export interface InventoryItemSummary {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  baseUnit: string;
  purchaseUnit: string | null;
  conversionRate: number;
  reorderPoint: number;
  lowStockAlertEnabled: boolean;
  active: boolean;
  stockOnHand: number;
  lowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryRecipeSummary {
  id: string;
  menuItemId: string;
  menuItemName: string;
  menuItemSku: string | null;
  active: boolean;
  saleDeductionEnabled: boolean;
  ingredients: Array<{
    inventoryItemId: string;
    inventoryItemName: string;
    inventoryItemSku: string | null;
    quantity: number;
    unit: string;
  }>;
}

export interface InventoryListResponse {
  items: InventoryItemSummary[];
  recipes: InventoryRecipeSummary[];
  recipeMenuItemIds: string[];
}

export interface InventoryMovementEntry {
  id: string;
  movementType:
    | 'PURCHASE'
    | 'SALE_DEDUCTION'
    | 'WASTAGE'
    | 'ADJUSTMENT'
    | 'STOCK_COUNT'
    | 'OPENING_BALANCE';
  quantityDelta: number;
  unit: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  createdAt: string;
  inventoryItem: {
    id: string;
    name: string;
    sku: string | null;
    baseUnit: string;
  };
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  } | null;
}

export interface InventoryMovementsResponse {
  movements: InventoryMovementEntry[];
}

export interface ResolveServiceRequestResponse {
  id: string;
  tableId: string;
  type: 'CALL_STAFF' | 'REQUEST_BILL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
  note: string | null;
  resolutionNote: string | null;
  requestedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface AttendanceSettingsResponse {
  id: string;
  requirePhoto: boolean;
  allowManualClockIn: boolean;
  maxShiftHours: number;
  autoFlagLateClockOut: boolean;
  timezone: string;
  version: number;
  updatedAt: string;
}

export interface AttendanceSessionPhoto {
  id: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  photoUrl: string;
  capturedAt: string;
  createdAt: string;
}

export interface AttendanceAdjustmentSummary {
  id: string;
  reason: string;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
  adjustedBy: {
    id: string;
    fullName: string;
    email: string;
  };
}

export interface AttendanceSessionEntry {
  id: string;
  status: 'CLOCKED_IN' | 'CLOCKED_OUT';
  approvalStatus: 'PENDING' | 'APPROVED' | 'ADJUSTED' | 'FLAGGED';
  clockInAt: string;
  clockOutAt: string | null;
  workedMinutes: number | null;
  clockInDeviceLabel: string | null;
  clockOutDeviceLabel: string | null;
  clockInIpAddress: string | null;
  clockOutIpAddress: string | null;
  clockInNote: string | null;
  clockOutNote: string | null;
  reviewReason: string | null;
  approvedAt: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  approvedBy: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  photos: AttendanceSessionPhoto[];
  adjustments: AttendanceAdjustmentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceCurrentResponse {
  settings: AttendanceSettingsResponse;
  currentSession: AttendanceSessionEntry | null;
  recentSessions: AttendanceSessionEntry[];
}
