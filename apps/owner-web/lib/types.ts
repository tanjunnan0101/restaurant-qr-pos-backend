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

export interface OwnerSession {
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

export interface LoginResponse {
  accessToken: string;
  expiresInSeconds: number;
  user: OwnerSession['user'];
}

export interface CompanyProfile {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  registrationNumber: string | null;
  defaultCurrency: string;
  defaultTimezone: string;
  status: string;
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

export type OwnerOrderStatus =
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

export interface OwnerOrderListEntry {
  id: string;
  orderNumber: string;
  source: string;
  serviceType: string;
  status: OwnerOrderStatus;
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

export interface OwnerOrderDetail {
  id: string;
  orderNumber: string;
  source: string;
  serviceType: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalCents: number;
  discountTotalCents: number;
  serviceChargeTotalCents: number;
  gstTotalCents: number;
  roundingAdjustmentCents: number;
  grandTotalCents: number;
  customerName: string | null;
  customerPhone: string | null;
  paidAt: string | null;
  sentToKitchenAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
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
    itemName: string;
    sku: string | null;
    variantName: string | null;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    remarks: string | null;
    modifiers: Array<{
      id: string;
      modifierGroupName: string;
      modifierOptionName: string;
      priceDeltaCents: number;
    }>;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    method: string;
    status: string;
    amountCents: number;
    currency: string;
    manualReference: string | null;
    providerFeeCents: number | null;
    netAmountCents: number | null;
    verifiedAt: string | null;
    paidAt: string | null;
    failedAt: string | null;
    failureReason: string | null;
    createdAt: string;
  }>;
  kitchenTickets: Array<{
    id: string;
    status: string;
    sentAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
    station: {
      id: string;
      key: string;
      name: string;
    };
  }>;
  printJobs: Array<{
    id: string;
    template: string;
    status: string;
    lastError: string | null;
    printedAt: string | null;
    printer: {
      id: string;
      name: string;
      role: string;
    } | null;
  }>;
}

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

export type MenuChannel = 'QR' | 'POS' | 'BOTH';

export interface SetupMenuInput {
  name: string;
  slug: string;
  channel?: MenuChannel;
  isDefault?: boolean;
  publish?: boolean;
  modifierGroups?: Array<{
    key: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    required: boolean;
    displayOrder?: number;
    options: Array<{
      name: string;
      priceDeltaCents: number;
      displayOrder?: number;
    }>;
  }>;
  categories: Array<{
    name: string;
    displayOrder?: number;
    active?: boolean;
    items: Array<{
      sku?: string;
      name: string;
      description?: string;
      basePriceCents: number;
      taxable?: boolean;
      serviceChargeable?: boolean;
      preparationStationKey?: string;
      active?: boolean;
      soldOut?: boolean;
      displayOrder?: number;
      variants?: Array<{
        name: string;
        priceDeltaCents: number;
        displayOrder?: number;
      }>;
      modifierGroupKeys?: string[];
    }>;
  }>;
}

export interface ReplaceMenuDraftInput {
  name?: string;
  channel?: MenuChannel;
  isDefault?: boolean;
  modifierGroups?: SetupMenuInput['modifierGroups'];
  categories: SetupMenuInput['categories'];
}

export interface MenuDetail {
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
          priceDeltaCents: number;
          displayOrder: number;
        }>;
        itemModifierGroups: Array<{
          modifierGroup: {
            id: string;
            key: string;
            name: string;
          };
          displayOrder: number;
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
        displayOrder: number;
      }>;
    }>;
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

export type DiningTableShape = 'SQUARE' | 'ROUND' | 'RECTANGLE' | 'BAR';
export type DiningTableStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'RESERVED'
  | 'OUT_OF_SERVICE';

export interface SetupDiningTablesInput {
  zones: Array<{
    name: string;
    displayOrder?: number;
    active?: boolean;
    tables: Array<{
      tableCode: string;
      displayName: string;
      capacity?: number;
      shape?: DiningTableShape;
      status?: DiningTableStatus;
      active?: boolean;
    }>;
  }>;
  rotateExistingQr?: boolean;
}

export interface SetupDiningTablesResponse {
  zones: TableZone[];
  qrCodes: Array<{
    tableId: string;
    tableCode: string;
    publicCode: string;
    qrUrl: string | null;
    generated: boolean;
  }>;
  note: string;
}

export interface RotateQrResponse {
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

export interface StaffRoleSummary {
  id: string;
  systemKey: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface StaffActivationSummary {
  pending: boolean;
  expiresAt: string | null;
}

export interface OutletStaffUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  lastLoginAt: string | null;
  role: StaffRoleSummary;
  activation: StaffActivationSummary;
}

export interface OutletStaffResponse {
  users: OutletStaffUser[];
}

export interface OutletStaffRolesResponse {
  roles: StaffRoleSummary[];
}

export interface OutletAuditEntry {
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
  outlet?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  before: unknown;
  after: unknown;
}

export interface OutletAuditResponse {
  entries: OutletAuditEntry[];
}

export interface StaffActivationLinkResponse {
  userId: string;
  activation: {
    token: string | null;
    expiresAt: string | null;
    url: string | null;
  };
}

export interface RemoveStaffAccessResponse {
  userId: string;
  removed: boolean;
}

export interface CreateStaffUserResponse {
  id: string;
  email: string;
  fullName: string;
  status: string;
  role: StaffRoleSummary;
  activation: {
    token: string | null;
    expiresAt: string | null;
    url: string | null;
  };
}

export type PrinterConnectionType =
  | 'EPSON_EPOS'
  | 'ESC_POS_LAN'
  | 'ESC_POS_USB_BRIDGE'
  | 'BLUETOOTH_BRIDGE'
  | 'BROWSER'
  | 'PDF';

export type PrinterRole = 'KITCHEN' | 'BAR' | 'RECEIPT' | 'BACKUP';

export interface PrintingConfiguration {
  stations: Array<{
    id: string;
    key: string;
    name: string;
    displayOrder: number;
    active: boolean;
    printerRoute: {
      primaryPrinter: {
        id: string;
        name: string;
        role: string;
      };
      backupPrinter: {
        id: string;
        name: string;
        role: string;
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
    active: boolean;
    healthStatus: string;
    lastHeartbeatAt: string | null;
    lastTestAt: string | null;
    lastTestResult: string | null;
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
    template: string;
    status: string;
    lastError: string | null;
    printer: {
      id: string;
      name: string;
      role: string;
    } | null;
    createdAt: string;
  }>;
}

export interface SetupPrintingInput {
  stations: Array<{
    key: string;
    name: string;
    displayOrder?: number;
    active?: boolean;
  }>;
  printers: Array<{
    key: string;
    name: string;
    connectionType: PrinterConnectionType;
    role: PrinterRole;
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

export interface SetupPrintingResponse {
  configuration: PrintingConfiguration;
  agent: {
    id: string;
    key: string | null;
    note: string;
  } | null;
}

export interface OutletDashboardData {
  outlet: OutletSummary;
  menuCount: number;
  latestMenuVersion: string | null;
  totalOrders: number;
  liveOrders: number;
  paidOrders: number;
  grossSalesCents: number;
  zoneCount: number;
  tableCount: number;
  qrCount: number;
  onlineEnabled: boolean;
  onlineCardEnabled: boolean;
  printerCount: number;
  agentCount: number;
  failedPrintJobs: number;
  setupReadinessPercent: number;
  setupChecklist: {
    menuPublished: boolean;
    tablesReady: boolean;
    checkoutReady: boolean;
    printingReady: boolean;
  };
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

export interface AttendanceSessionListResponse {
  sessions: AttendanceSessionEntry[];
}
