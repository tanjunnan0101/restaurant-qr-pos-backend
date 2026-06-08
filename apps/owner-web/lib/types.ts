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
  | 'MANUAL_PAYNOW';

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
  zoneCount: number;
  tableCount: number;
  qrCount: number;
  onlineEnabled: boolean;
  onlineCardEnabled: boolean;
  printerCount: number;
  agentCount: number;
  failedPrintJobs: number;
}
