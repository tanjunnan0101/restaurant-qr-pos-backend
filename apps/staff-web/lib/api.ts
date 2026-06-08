import type {
  CheckoutSessionResponse,
  CreateStaffOrderInput,
  LoginResponse,
  MenuListEntry,
  OrderDetail,
  OrderListEntry,
  OutletSummary,
  StaffMenuDetail,
  StaffOrderStatus,
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
) {
  const query =
    status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
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

export function getMenus(token: string, outletId: string) {
  return request<MenuListEntry[]>(
    `/admin/outlets/${encodeURIComponent(outletId)}/menus`,
    {
      headers: authHeaders(token),
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
