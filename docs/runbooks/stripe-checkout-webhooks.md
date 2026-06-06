# Stripe Checkout and Webhooks

## Payment flow

1. The customer creates a QR order with `STRIPE_CARD` or `STRIPE_PAYNOW`.
2. The customer app calls
   `POST /api/v1/public/qr/:publicCode/:token/orders/:orderId/payment` with an
   `Idempotency-Key`, `successUrl`, and `cancelUrl`.
3. The API creates or reuses one hosted Stripe Checkout Session for that
   payment attempt.
4. The customer completes payment on Stripe.
5. Stripe posts a signed event to `POST /api/v1/webhooks/stripe`.
6. The API verifies the signature, order metadata, payment attempt, currency,
   and exact server-calculated amount.
7. The payment, order, kitchen tickets, and print jobs are committed together.

The browser redirect is informational only. Never use the success page or a
client-supplied payment result to mark an order paid.

## Environment

Set these secrets on the API service:

```text
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_WEBHOOK_SECRET=whsec_endpoint_secret
```

Do not set `STRIPE_API_HOST`, `STRIPE_API_PORT`, or `STRIPE_API_PROTOCOL` in
production. They exist only for the local smoke stub.

## Stripe webhook endpoint

Create one HTTPS webhook endpoint in Stripe:

```text
https://api.example.com/api/v1/webhooks/stripe
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Use the signing secret belonging to that exact endpoint. Test-mode and
live-mode endpoints have different secrets.

Card payments normally arrive as a paid `checkout.session.completed`. PayNow
can first arrive as completed but unpaid; that leaves the order in
`PROCESSING`. The asynchronous success event performs the one-time kitchen
release.

## Payment shutdown controls

Operators can disable all Stripe payments with scope `STRIPE`, or PayNow alone
with scope `STRIPE_PAYNOW`:

`POST /api/v1/admin/outlets/:outletId/payment-settings/disable`

The disable may be indefinite or have an `until` timestamp. Public QR
availability and Checkout creation both enforce the same setting. Re-enable
through the payment-settings enable endpoint.

## Local verification

Prerequisites:

- PostgreSQL and Redis are running.
- Migrations and seed/setup data are applied.
- The seeded demo tenant login is available.
- The API is not already listening on port `3001`.

Build and run the repeatable local test:

```powershell
npm run build
npm run smoke:stripe
```

The harness starts a local Stripe-compatible stub and an API process with test
configuration. It logs into the seeded demo tenant and creates a minimal
published menu, dining table, and printer route if they do not yet exist. It
verifies:

- Invalid webhook signatures return `400`.
- Checkout creation is idempotent.
- A paid card event releases exactly one kitchen ticket and print job.
- A duplicate event and a second success event do not release twice.
- An unpaid PayNow completion remains processing.
- A later PayNow asynchronous success releases exactly once.
- A signed event with the wrong amount does not mark the order paid.

This test does not contact Stripe. Before launch, repeat the workflow with a
real Stripe test account, Stripe-hosted Checkout, and the configured webhook
endpoint.

## Operations

Monitor `webhook_events` for `FAILED` records and investigate the stored error
before manually changing an order. Common causes are mismatched amount,
currency, order metadata, or payment-attempt metadata.

Stripe may retry webhooks or deliver them out of order. The provider event ID
is unique, and payment success is claimed conditionally, so retries are safe.
Return the webhook response quickly and keep the endpoint publicly reachable
over HTTPS.
