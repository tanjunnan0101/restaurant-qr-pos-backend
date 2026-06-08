import type {
  CompanyProfile,
  LoginResponse,
  MenuDetail,
  MenuListEntry,
  OutletAuditEntry,
  OutletAuditResponse,
  OwnerOrderListEntry,
  OwnerOrderStatus,
  OutletSummary,
  PaymentScope,
  PaymentSettingsResponse,
  ReplaceMenuDraftInput,
  CreateStaffUserResponse,
  OutletStaffResponse,
  OutletStaffRolesResponse,
  PrintingConfiguration,
  RotateQrResponse,
  StaffActivationLinkResponse,
  SetupMenuInput,
  SetupPrintingInput,
  SetupPrintingResponse,
  SetupDiningTablesInput,
  SetupDiningTablesResponse,
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

export function activateAccount(token: string, password: string) {
  return request<{
    activated: boolean;
    companySlug: string;
    email: string;
  }>('/auth/activate', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
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

export function getCurrentCompany(token: string) {
  return request<CompanyProfile>('/admin/company', {
    headers: authHeaders(token),
  });
}

export function updateCurrentCompany(
  token: string,
  input: {
    name?: string;
    legalName?: string;
    registrationNumber?: string;
    defaultCurrency?: string;
    defaultTimezone?: string;
    reason: string;
  },
) {
  return request<CompanyProfile>('/admin/company', {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export function getOutlets(token: string) {
  return request<OutletSummary[]>('/admin/outlets', {
    headers: authHeaders(token),
  });
}

export function createOutlet(
  token: string,
  input: {
    name: string;
    slug: string;
    timezone?: string;
    currency?: string;
    gstEnabled?: boolean;
    gstRateBps?: number;
    serviceChargeEnabled?: boolean;
    serviceChargeBps?: number;
  },
) {
  return request<OutletSummary>('/admin/outlets', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export function updateOutlet(
  token: string,
  outletId: string,
  input: {
    name?: string;
    slug?: string;
    timezone?: string;
    currency?: string;
    gstEnabled?: boolean;
    gstRateBps?: number;
    serviceChargeEnabled?: boolean;
    serviceChargeBps?: number;
    reason: string;
  },
) {
  return request<OutletSummary>(
    `/admin/outlets/${encodeURIComponent(outletId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getOrders(
  token: string,
  outletId: string,
  status?: OwnerOrderStatus | 'ALL',
) {
  const query =
    status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
  return request<OwnerOrderListEntry[]>(
    `/admin/outlets/${encodeURIComponent(outletId)}/orders${query}`,
    {
      headers: authHeaders(token),
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

export function createMenuSetup(
  token: string,
  outletId: string,
  input: SetupMenuInput,
) {
  return request<unknown>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/setup`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getMenuDetail(token: string, outletId: string, menuId: string) {
  return request<MenuDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/${encodeURIComponent(menuId)}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function cloneMenuDraft(
  token: string,
  outletId: string,
  menuId: string,
) {
  return request<MenuDetail>(
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
  input: ReplaceMenuDraftInput,
) {
  return request<MenuDetail>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/${encodeURIComponent(menuId)}/draft`,
    {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function publishMenu(token: string, outletId: string, menuId: string) {
  return request<unknown>(
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
  return request<{ id: string; soldOut: boolean }>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus/items/${encodeURIComponent(itemId)}/sold-out`,
    {
      method: 'PATCH',
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

export function setupTables(
  token: string,
  outletId: string,
  input: SetupDiningTablesInput,
) {
  return request<SetupDiningTablesResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/tables/setup`,
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
  input: { reason: string },
) {
  return request<RotateQrResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/tables/${encodeURIComponent(tableId)}/qr/rotate`,
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

export function getPrinting(token: string, outletId: string) {
  return request<PrintingConfiguration>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing`,
    {
      headers: authHeaders(token),
    },
  );
}

export function setupPrinting(
  token: string,
  outletId: string,
  input: SetupPrintingInput,
) {
  return request<SetupPrintingResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing/setup`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function queuePrinterTest(
  token: string,
  outletId: string,
  printerId: string,
  input: { reason: string },
) {
  return request<{ id: string; status?: string }>(
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
  input: { reason: string },
) {
  return request<{ id: string; status?: string }>(
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
  input: { reason: string },
) {
  return request<{ id: string; status?: string }>(
    `/admin/outlets/${encodeURIComponent(outletId)}/printing/jobs/${encodeURIComponent(printJobId)}/reprint`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
}

export function getOutletStaff(token: string, outletId: string) {
  return request<OutletStaffResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/staff`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getOutletStaffRoles(token: string, outletId: string) {
  return request<OutletStaffRolesResponse>(
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
  return request<CreateStaffUserResponse>(
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
  return request<{
    userId: string;
    role: {
      id: string;
      systemKey: string;
      name: string;
      permissions: string[];
    };
  }>(
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
  return request<StaffActivationLinkResponse>(
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
  return request<{
    userId: string;
    removed: boolean;
  }>(
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
  const query = params.toString();

  return request<OutletAuditResponse>(
    `/admin/outlets/${encodeURIComponent(outletId)}/audit-logs${query ? `?${query}` : ''}`,
    {
      headers: authHeaders(token),
    },
  );
}

export function getCompanyAuditLogs(
  token: string,
  input?: {
    limit?: number;
    actionType?: string;
    outletId?: string;
  },
) {
  const params = new URLSearchParams();
  if (input?.limit) {
    params.set('limit', String(input.limit));
  }
  if (input?.actionType) {
    params.set('actionType', input.actionType);
  }
  if (input?.outletId) {
    params.set('outletId', input.outletId);
  }
  const query = params.toString();

  return request<{ entries: OutletAuditEntry[] }>(
    `/admin/company/audit-logs${query ? `?${query}` : ''}`,
    {
      headers: authHeaders(token),
    },
  );
}
