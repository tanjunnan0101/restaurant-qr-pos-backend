# HitPay Hosted Checkout and Webhooks

## Payment flow

1. The customer creates a QR order with `STRIPE_CARD`.
2. The customer app calls
   `POST /api/v1/public/qr/:publicCode/:token/orders/:orderId/payment` with an
   `Idempotency-Key`, `successUrl`, and `cancelUrl`.
3. The API creates or reuses one hosted HitPay payment request for that
   payment attempt.
4. The customer completes payment on HitPay.
5. HitPay posts a signed event to `POST /api/v1/webhooks/hitpay`.
6. The API verifies the signature, payment attempt, currency,
   and exact server-calculated amount.
7. The payment, order, kitchen tickets, and print jobs are committed together.

The browser redirect is informational only. Never use the success page or a
client-supplied payment result by itself to mark an order paid. The customer
return page asks the API to reconcile the latest HitPay payment-request status
so cancellations and delayed webhook delivery can still unwind cleanly.

## Environment

Set these secrets on the API service:

```text
HITPAY_API_KEY=<sandbox-or-live-business-api-key>
HITPAY_WEBHOOK_SALT=<webhook-salt-from-hitpay-dashboard>
HITPAY_API_URL=https://api.sandbox.hit-pay.com
```

Switch `HITPAY_API_URL` to the live HitPay API host only when production is
ready for live traffic.

## HitPay webhook endpoint

Create one HTTPS webhook endpoint in HitPay:

```text
https://api.example.com/api/v1/webhooks/hitpay
```

Configure it for the `payment_request` object and subscribe to at least the
completed and failed payment lifecycle events used by the hosted checkout
flow. HitPay signs the raw JSON payload in the `Hitpay-Signature` header.

The API uses the payment-request ID from HitPay as the hosted checkout
reference and the local payment ID as `reference_number` for correlation.

Use separate sandbox and live webhook configurations and keep the salts
environment-specific.

## Payment shutdown controls

Operators can disable the hosted checkout path through the existing online
payment controls:

`POST /api/v1/admin/outlets/:outletId/payment-settings/disable`

The disable may be indefinite or have an `until` timestamp. Public QR
availability and Checkout creation both enforce the same setting. Re-enable
through the payment-settings enable endpoint.

## Verification

There is no longer a local Stripe stub in the continuation baseline. Validate
HitPay in a deployed sandbox environment:

- Start checkout from the customer QR app.
- Confirm the customer is redirected to HitPay.
- Complete one successful sandbox payment and verify the order is marked paid
  exactly once.
- Trigger one cancelled or failed flow and verify the order returns to
  `PENDING_PAYMENT` instead of remaining stuck in `PAYMENT_PROCESSING`.
- Confirm duplicate webhook delivery does not release the kitchen twice.

## Operations

Monitor `webhook_events` for `FAILED` records and investigate the stored error
before manually changing an order. Common causes are mismatched amount,
currency, or a mismatched payment-attempt reference.

HitPay may retry webhooks or deliver them out of order. The provider event ID
is unique, and payment success is claimed conditionally, so retries are safe.
Return the webhook response quickly and keep the endpoint publicly reachable
over HTTPS.
