export const paymentScopes = [
  'ONLINE',
  'STRIPE',
  'ONLINE_CARD',
  'STRIPE_PAYNOW',
  'MANUAL_PAYNOW',
  'CASH',
] as const;

export type PaymentScope = (typeof paymentScopes)[number];

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id: string;
  };
}
