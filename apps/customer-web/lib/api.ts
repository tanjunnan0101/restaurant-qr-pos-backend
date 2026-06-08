import type {
  CartItem,
  CheckoutResponse,
  PaymentMethod,
  PublicOrder,
  PublicQrResponse,
  ServiceRequestResponse,
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
  });
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    const message = body?.error?.message;
    throw new Error(
      Array.isArray(message)
        ? message.join(' ')
        : message || 'Something went wrong. Please try again.',
    );
  }
  return (await response.json()) as T;
}

export function resolveQr(publicCode: string, token: string) {
  return request<PublicQrResponse>(
    `/public/qr/${encodeURIComponent(publicCode)}/${encodeURIComponent(token)}`,
  );
}

export function createOrder(input: {
  publicCode: string;
  token: string;
  idempotencyKey: string;
  paymentMethod: PaymentMethod;
  items: CartItem[];
}) {
  return request<PublicOrder>(
    `/public/qr/${encodeURIComponent(input.publicCode)}/${encodeURIComponent(input.token)}/orders`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({
        serviceType: 'DINE_IN',
        paymentMethod: input.paymentMethod,
        items: input.items.map((item) => ({
          menuItemId: item.menuItemId,
          variantId: item.variantId,
          quantity: item.quantity,
          modifierOptionIds: item.modifierOptionIds,
          remarks: item.remarks,
        })),
      }),
    },
  );
}

export function createCheckout(input: {
  publicCode: string;
  token: string;
  orderId: string;
  idempotencyKey: string;
  paymentMethod: PaymentMethod;
  successUrl: string;
  cancelUrl: string;
}) {
  return request<CheckoutResponse>(
    `/public/qr/${encodeURIComponent(input.publicCode)}/${encodeURIComponent(input.token)}/orders/${encodeURIComponent(input.orderId)}/payment`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({
        paymentMethod: input.paymentMethod,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      }),
    },
  );
}

export function requestHelp(input: {
  publicCode: string;
  token: string;
  note?: string;
}) {
  return request<ServiceRequestResponse>(
    `/public/qr/${encodeURIComponent(input.publicCode)}/${encodeURIComponent(input.token)}/service-requests/help`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      }),
    },
  );
}

export function reconcileHitPayReturn(input: {
  publicCode: string;
  token: string;
  orderId: string;
  reference?: string | null;
  status?: string | null;
}) {
  return request<{
    reconciled: boolean;
    released?: boolean;
    providerStatus?: string;
  }>(
    `/public/qr/${encodeURIComponent(input.publicCode)}/${encodeURIComponent(input.token)}/orders/${encodeURIComponent(input.orderId)}/payment/return`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(input.reference ? { reference: input.reference } : {}),
        ...(input.status ? { status: input.status } : {}),
      }),
    },
  );
}

export function getOrder(publicCode: string, token: string, orderId: string) {
  return request<PublicOrder>(
    `/public/qr/${encodeURIComponent(publicCode)}/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderId)}`,
    { cache: 'no-store' },
  );
}
