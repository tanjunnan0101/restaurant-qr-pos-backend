import type {
  AttendanceCurrentResponse,
  AttendanceSessionEntry,
  AssignableStaffRolesResponse,
  CheckoutSessionResponse,
  CreateStaffOrderInput,
  DiningTableStatus,
  DiningTableStatusUpdateResponse,
  InventoryListResponse,
  InventoryMovementsResponse,
  OutletPrintingSettingsResponse,
  OutletAuditLogListResponse,
  OutletPrintingOperationsResponse,
  OutletStaffListResponse,
  LoginResponse,
  MenuListEntry,
  MenuItemAvailabilityResponse,
  OrderDetail,
  OrderListEntry,
  OutletSummary,
  PaymentScope,
  PaymentSettingsResponse,
  PrintJobActionResponse,
  PrintingSetupPayload,
  PrintingSetupResponse,
  ResolveServiceRequestResponse,
  RotateTableQrResponse,
  StaffMenuDetail,
  StaffOrderStatus,
  StaffUserMutationResponse,
  SetupDiningTablesInput,
  SetupMenuInput,
  TableZone,
} from './types';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/$/, '');

interface ApiErrorBody {
  error?: {
    message?: string | string[];
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    const message = body?.error?.message;
    throw new Error(
      Array.isArray(message) ? message.join(' ') : message || 'Request failed.',
    );
  }

  return (await response.json()) as T;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function login(input: {
  companySlug: string;
  email: string;
  password: string;
}) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getOutlets(token: string) {
  return request<OutletSummary[]>('/admin/outlets', {
    headers: authHeaders(token),
  });
}

export function getOrders(
  token: string,
  outletId: string,
  status?: StaffOrderStatus | 'ALL',
  tableId?: string,
) {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') {
    params.set('status', status);
  }
  if (tableId) {
    params.set('tableId', tableId);
  }
  const query = params.size ? `?${params.toString()}` : '';
  return request<OrderListEntry[]>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders${query}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getOrder(token: string, outletId: string, orderId: string) {
  return request<OrderDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(orderId)}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function updateOrderStatus(
  token: string,
  outletId: string,
  orderId: string,
  input: {
    status: Extract<
      StaffOrderStatus,
      'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED'
    >;
    reason: string;
  },
) {
  return request<OrderDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(orderId)}/status`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getTables(token: string, outletId: string) {
  return request<TableZone[]>(
    `/admin/outlets/${encodeURIComponent(outletId)}/tables`,
    {
      headers: authHeaders(token),
    },
  );
}

export function setupDiningTables(
  token: string,
  outletId: string,
  input: SetupDiningTablesInput,
) {
  return request<{
    zones: TableZone[];
    qrCodes: Array<{
      tableId: string;
      tableCode: string;
      publicCode: string;
      qrUrl: string | null;
      generated: boolean;
    }>;
    note: string;
  }>(`/admin/outlets/${encodeURIComponent(outletId)}/tables/setup`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export function updateTableStatus(
  token: string,
  outletId: string,
  tableId: string,
  input: {
    status: DiningTableStatus;
    reason: string;
  },
) {
  return request<DiningTableStatusUpdateResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/tables/${encodeURIComponent(tableId)}/status`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function rotateTableQr(
  token: string,
  outletId: string,
  tableId: string,
  input: {
    reason: string;
  },
) {
  return request<RotateTableQrResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/tables/${encodeURIComponent(tableId)}/qr/rotate`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function resolveTableServiceRequest(
  token: string,
  outletId: string,
  tableId: string,
  requestId: string,
  input?: {
    note?: string;
  },
) {
  return request<ResolveServiceRequestResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/tables/${encodeURIComponent(tableId)}/service-requests/${encodeURIComponent(requestId)}/resolve`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        ...(input?.note?.trim() ? { note: input.note.trim() } : {}),
      }),
    },
  );
}

export function getMenus(token: string, outletId: string) {
  return request<MenuListEntry[]>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus`,
    {
      headers: authHeaders(token),
    },
  );
}

export function setupMenu(
  token: string,
  outletId: string,
  input: SetupMenuInput,
) {
  return request<StaffMenuDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/setup`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getMenuDetail(token: string, outletId: string, menuId: string) {
  return request<StaffMenuDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/${encodeURIComponent(menuId)}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function cloneMenuDraft(token: string, outletId: string, menuId: string) {
  return request<StaffMenuDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/${encodeURIComponent(menuId)}/draft/clone`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
  );
}

export function replaceMenuDraft(
  token: string,
  outletId: string,
  menuId: string,
  input: import('./types').ReplaceMenuDraftInput,
) {
  return request<StaffMenuDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/${encodeURIComponent(menuId)}/draft`,
    {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function publishMenu(token: string, outletId: string, menuId: string) {
  return request<StaffMenuDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/${encodeURIComponent(menuId)}/publish`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
  );
}

export function setMenuItemSoldOut(
  token: string,
  outletId: string,
  itemId: string,
  input: {
    soldOut: boolean;
    reason: string;
  },
) {
  return request<MenuItemAvailabilityResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/items/${encodeURIComponent(itemId)}/sold-out`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getOutletStaff(token: string, outletId: string) {
  return request<OutletStaffListResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/staff`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getAssignableStaffRoles(token: string, outletId: string) {
  return request<AssignableStaffRolesResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/staff/roles`,
    {
      headers: authHeaders(token),
    },
  );
}

export function createOutletStaffUser(
  token: string,
  outletId: string,
  input: {
    email: string;
    fullName: string;
    roleKey: string;
  },
) {
  return request<StaffUserMutationResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/staff`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function updateOutletStaffRole(
  token: string,
  outletId: string,
  userId: string,
  input: {
    roleKey: string;
    reason: string;
  },
) {
  return request<StaffUserMutationResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/staff/${encodeURIComponent(userId)}/role`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function reissueOutletStaffActivation(
  token: string,
  outletId: string,
  userId: string,
  input: {
    reason: string;
  },
) {
  return request<StaffUserMutationResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/staff/${encodeURIComponent(userId)}/reissue-activation`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function removeOutletStaffAccess(
  token: string,
  outletId: string,
  userId: string,
  input: {
    reason: string;
  },
) {
  return request<StaffUserMutationResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/staff/${encodeURIComponent(userId)}/remove-access`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getOutletAuditLogs(
  token: string,
  outletId: string,
  input?: {
    limit?: number;
    actionType?: string;
  },
) {
  const params = new URLSearchParams();
  if (input?.limit) {
    params.set('limit', String(input.limit));
  }
  if (input?.actionType) {
    params.set('actionType', input.actionType);
  }
  const query = params.size ? `?${params.toString()}` : '';
  return request<OutletAuditLogListResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/audit-logs${query}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function createStaffOrder(
  token: string,
  outletId: string,
  idempotencyKey: string,
  input: CreateStaffOrderInput,
) {
  return request<OrderDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
}

export function amendStaffOrder(
  token: string,
  outletId: string,
  orderId: string,
  input: CreateStaffOrderInput,
) {
  return request<OrderDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(orderId)}/amend`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function printPrePaymentBill(
  token: string,
  outletId: string,
  orderId: string,
  input: {
    reason: string;
  },
) {
  return request<PrintJobActionResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(orderId)}/print-bill`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function createAdminCheckout(
  token: string,
  outletId: string,
  orderId: string,
  idempotencyKey: string,
  input: {
    paymentMethod: 'ONLINE_CARD';
    successUrl: string;
    cancelUrl: string;
  },
) {
  return request<CheckoutSessionResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(orderId)}/payment`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
}

export function verifyManualPayNow(
  token: string,
  outletId: string,
  orderId: string,
  idempotencyKey: string,
  input: {
    amountCents: number;
    reference: string;
    reason: string;
  },
) {
  return request<OrderDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(orderId)}/manual-paynow/verify`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
}

export function cancelOrder(
  token: string,
  outletId: string,
  orderId: string,
  input: {
    reason: string;
  },
) {
  return request<OrderDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getPaymentSettings(token: string, outletId: string) {
  return request<PaymentSettingsResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/payment-settings`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getPrintingSettings(token: string, outletId: string) {
  return request<OutletPrintingSettingsResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getPrintingOperations(token: string, outletId: string) {
  return request<OutletPrintingOperationsResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing`,
    {
      headers: authHeaders(token),
    },
  );
}

export function queuePrinterTest(
  token: string,
  outletId: string,
  printerId: string,
  input: {
    reason: string;
  },
) {
  return request<PrintJobActionResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing/printers/${encodeURIComponent(printerId)}/test`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function retryPrintJob(
  token: string,
  outletId: string,
  printJobId: string,
  input: {
    reason: string;
  },
) {
  return request<PrintJobActionResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing/jobs/${encodeURIComponent(printJobId)}/retry`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function reprintJob(
  token: string,
  outletId: string,
  printJobId: string,
  input: {
    reason: string;
  },
) {
  return request<PrintJobActionResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing/jobs/${encodeURIComponent(printJobId)}/reprint`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function setupPrinting(
  token: string,
  outletId: string,
  input: PrintingSetupPayload,
) {
  return request<PrintingSetupResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing/setup`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function disablePaymentScope(
  token: string,
  outletId: string,
  input: {
    scope: PaymentScope;
    reason: string;
    until?: string;
  },
) {
  return request<PaymentSettingsResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/payment-settings/disable`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function enablePaymentScope(
  token: string,
  outletId: string,
  input: {
    scope: PaymentScope;
    reason: string;
  },
) {
  return request<PaymentSettingsResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/payment-settings/enable`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getAttendanceCurrent(
  token: string,
  outletId: string,
  userId?: string,
) {
  const params = new URLSearchParams();
  if (userId) {
    params.set('userId', userId);
  }
  const query = params.size ? `?${params.toString()}` : '';
  return request<AttendanceCurrentResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/attendance/current${query}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getInventory(token: string, outletId: string) {
  return request<InventoryListResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/inventory`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getInventoryMovements(
  token: string,
  outletId: string,
  input?: {
    limit?: number;
  },
) {
  const params = new URLSearchParams();
  if (input?.limit) {
    params.set('limit', String(input.limit));
  }
  const query = params.size ? `?${params.toString()}` : '';
  return request<InventoryMovementsResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/inventory/movements${query}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function createInventoryItem(
  token: string,
  outletId: string,
  input: {
    sku?: string;
    name: string;
    category?: string;
    baseUnit: string;
    purchaseUnit?: string;
    conversionRate?: number;
    reorderPoint?: number;
    lowStockAlertEnabled?: boolean;
    active?: boolean;
  },
) {
  return request(
    `/admin/outlets/${encodeURIComponent(outletId)}/inventory/items`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function updateInventoryItem(
  token: string,
  outletId: string,
  itemId: string,
  input: {
    sku?: string;
    name?: string;
    category?: string;
    baseUnit?: string;
    purchaseUnit?: string;
    conversionRate?: number;
    reorderPoint?: number;
    lowStockAlertEnabled?: boolean;
    active?: boolean;
    reason: string;
  },
) {
  return request(
    `/admin/outlets/${encodeURIComponent(outletId)}/inventory/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function recordInventoryMovement(
  token: string,
  outletId: string,
  path: 'stock-in' | 'wastage' | 'adjustment',
  input: {
    inventoryItemId: string;
    quantity: number;
    reason?: string;
  },
) {
  return request(
    `/admin/outlets/${encodeURIComponent(outletId)}/inventory/movements/${path}`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function recordInventoryStockCount(
  token: string,
  outletId: string,
  input: {
    inventoryItemId: string;
    actualQuantity: number;
    reason: string;
  },
) {
  return request(
    `/admin/outlets/${encodeURIComponent(outletId)}/inventory/movements/stock-count`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function upsertInventoryRecipe(
  token: string,
  outletId: string,
  menuItemId: string,
  input: {
    active?: boolean;
    saleDeductionEnabled?: boolean;
    reason: string;
    ingredients: Array<{
      inventoryItemId: string;
      quantity: number;
      unit: string;
    }>;
  },
) {
  return request(
    `/admin/outlets/${encodeURIComponent(outletId)}/inventory/recipes/${encodeURIComponent(menuItemId)}`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function clockInAttendance(
  token: string,
  outletId: string,
  input?: {
    userId?: string;
    scheduledShiftId?: string;
    deviceLabel?: string;
    note?: string;
    photoDataUrl?: string;
  },
) {
  return request<AttendanceSessionEntry>(
    `/admin/outlets/${encodeURIComponent(outletId)}/attendance/clock-in`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input ?? {}),
    },
  );
}

export function clockOutAttendance(
  token: string,
  outletId: string,
  input?: {
    userId?: string;
    scheduledShiftId?: string;
    deviceLabel?: string;
    note?: string;
    photoDataUrl?: string;
  },
) {
  return request<AttendanceSessionEntry>(
    `/admin/outlets/${encodeURIComponent(outletId)}/attendance/clock-out`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input ?? {}),
    },
  );
}

export function createAttendanceSchedule(
  token: string,
  outletId: string,
  input: {
    userId: string;
    title: string;
    stationLabel?: string;
    note?: string;
    startsAt: string;
    endsAt: string;
  },
) {
  return request(
    `/admin/outlets/${encodeURIComponent(outletId)}/attendance/schedules`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function cancelAttendanceSchedule(
  token: string,
  outletId: string,
  shiftId: string,
  input: {
    reason: string;
  },
) {
  return request(
    `/admin/outlets/${encodeURIComponent(outletId)}/attendance/schedules/${encodeURIComponent(shiftId)}/cancel`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}
