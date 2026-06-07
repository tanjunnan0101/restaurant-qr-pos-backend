# Restaurant QR POS

Multi-tenant restaurant QR ordering and POS platform.

For takeover status, architecture boundaries, and the next milestones, start
with [HANDOFF.md](HANDOFF.md). Production deployment guidance is in
[docs/deployment.md](docs/deployment.md).

## Cloud deployment artifacts

The repository provides three container definitions:

- `infra/Dockerfile.api` for the NestJS API on port `3001`.
- `infra/Dockerfile.customer-web` for the Next.js customer app on port `3000`.
- `infra/Dockerfile.migrate` for a one-off Prisma migration release job.

The API health endpoint returns HTTP `200` only when PostgreSQL and Redis are
available, and HTTP `503` when either dependency is unavailable. GitHub Actions
builds all three images, applies migrations to clean PostgreSQL, starts the
production API image, and verifies `/api/v1/health`.

## Current scope

- Mobile-first customer QR ordering web app with menu search, item
  customisation, cart totals, and payment selection.
- NestJS REST API with Swagger/OpenAPI.
- PostgreSQL and Prisma tenant/auth schema.
- JWT authentication and outlet-scoped RBAC.
- Company and outlet administration.
- Audited payment controls for online payments, Stripe, Stripe card, Stripe PayNow, and manual PayNow.
- One-call client onboarding with owner activation, default roles, payment defaults, and a setup checklist.
- Versioned menu setup with categories, items, variants, modifiers, publishing, and sold-out controls.
- Bulk dining-zone and table setup with secure, rotatable QR codes.
- Public QR resolution with the current published menu and live payment availability.
- Server-priced, idempotent QR order creation with immutable item and modifier snapshots.
- Hosted Stripe Checkout for cards and PayNow with signed, idempotent webhook fulfilment.
- Manual PayNow verification and audited order state transitions.
- Station-routed kitchen tickets and persisted print jobs after payment confirmation.
- ESC/POS Wi-Fi/LAN printer agent with leasing, retries, backup routing, and test prints.
- Temporary payment shutdowns with automatic effective re-enable after the configured timestamp.
- Redis/BullMQ print queue foundation.
- Socket.IO operations gateway.

## Local setup

1. Copy `.env.example` to `.env` and change the secrets.
2. Start PostgreSQL and Redis using `infra/compose.yaml` or equivalent local services.
3. Run `npm install`.
4. Run `npm run prisma:generate`.
5. Run `npm run prisma:deploy`.
6. Run `npm run prisma:seed`.
7. Run `npm run dev` for the API.
8. In a second terminal, run `npm run dev:customer`.

Swagger is available at `http://localhost:3001/docs`.
The customer web app is available at `http://localhost:3000`. Its real entry
point is a generated QR URL in the form `/q/:publicCode/:token`.

The seeded login defaults to `owner@example.com` / `ChangeMe123!` unless overridden in `.env`.

## Customer QR web app

The Next.js application in `apps/customer-web` consumes only public QR and
order endpoints. It provides:

- Outlet, dining-zone, and table confirmation after scanning.
- Published menu browsing, search, categories, sold-out handling, variants,
  modifiers, remarks, and quantity controls.
- A session-persisted cart with server-compatible service charge and GST
  previews.
- Stripe card, Stripe PayNow, and manual PayNow choices based on the outlet's
  effective payment settings.
- Processing, paid, cancelled, failed, delayed PayNow, and manual-verification
  states.

Set `NEXT_PUBLIC_API_BASE_URL` at image build time for deployments. Payment
availability is always loaded from the API, so manually disabling Stripe or
either PayNow method takes effect without rebuilding the frontend.

## Client onboarding

Internal operators create a complete client shell through:

`POST /api/v1/platform/onboarding/clients`

Required headers:

- `x-platform-key`
- `Idempotency-Key`

The response contains a one-time owner activation URL. Only the activation-token hash is stored. Repeating the same idempotency key returns the existing client instead of creating a duplicate.

For the operator-friendly PowerShell command, see [Client Onboarding Runbook](docs/runbooks/client-onboarding.md).

## Payment control semantics

`POST /api/v1/admin/outlets/:outletId/payment-settings/disable`

- Without `until`, the selected scope is disabled indefinitely.
- With a future `until`, the scope is temporarily blocked and becomes effective again after that timestamp.
- Every change requires a reason and is written to the audit log in the same database transaction.

Scopes:

- `ONLINE`
- `STRIPE`
- `STRIPE_CARD`
- `STRIPE_PAYNOW`
- `MANUAL_PAYNOW`

## Menu, tables, and QR setup

An owner or manager can configure a complete first menu in one request:

`POST /api/v1/admin/outlets/:outletId/menus/setup`

Further menu changes use a draft so the currently published version remains
stable:

- `POST /api/v1/admin/outlets/:outletId/menus/:menuId/draft/clone`
- `PUT /api/v1/admin/outlets/:outletId/menus/:menuId/draft`
- `POST /api/v1/admin/outlets/:outletId/menus/:menuId/publish`
- `PATCH /api/v1/admin/outlets/:outletId/menus/items/:itemId/sold-out`

Dining zones, tables, and their initial QR codes are configured in bulk:

`POST /api/v1/admin/outlets/:outletId/tables/setup`

QR URLs contain a random token. Only its SHA-256 hash is stored, so the full
URL is returned only when the code is generated or rotated:

`POST /api/v1/admin/outlets/:outletId/tables/:tableId/qr/rotate`

Customer applications resolve a scan through:

`GET /api/v1/public/qr/:publicCode/:token`

The response includes the outlet, table, current published QR menu, and
effective payment availability. Disabling Stripe or either PayNow method is
therefore reflected immediately without reprinting the QR code.

## Orders and kitchen release

Customer orders are created through:

`POST /api/v1/public/qr/:publicCode/:token/orders`

The request requires an `Idempotency-Key` header. The client submits menu,
variant, and modifier IDs only. Prices, service charge, GST, and totals are
calculated by the API from the published menu.

Manual PayNow orders remain locked in `PENDING_PAYMENT` until authorised staff
verify the exact amount:

`POST /api/v1/admin/outlets/:outletId/orders/:orderId/manual-paynow/verify`

Successful verification creates station-specific kitchen tickets and print
jobs in the same database transaction.

## Stripe card and PayNow

Customers start hosted Stripe Checkout through:

`POST /api/v1/public/qr/:publicCode/:token/orders/:orderId/payment`

The endpoint requires an `Idempotency-Key` and accepts only `STRIPE_CARD` or
`STRIPE_PAYNOW`. The backend sends Stripe the server-calculated total and
stores the resulting Checkout Session.

Stripe sends payment results to:

`POST /api/v1/webhooks/stripe`

The endpoint verifies `Stripe-Signature` against the raw request body.
Success or cancel redirects never mark an order paid. A verified event must
match the local order, payment attempt, amount, and currency before the order
is released to the kitchen. Duplicate and repeated success events cannot
release it twice.

PayNow may complete asynchronously. An unpaid `checkout.session.completed`
keeps the order in `PROCESSING`; only
`checkout.session.async_payment_succeeded` marks it paid.

See [Stripe Checkout and Webhooks Runbook](docs/runbooks/stripe-checkout-webhooks.md).

## Wi-Fi/LAN printing

Printer stations, routes, backups, and a local-agent credential are configured
through:

`POST /api/v1/admin/outlets/:outletId/printing/setup`

The agent runs inside the restaurant network and sends ESC/POS data directly
to the printer IP, normally on TCP port `9100`. See
[Order and Printer Runbook](docs/runbooks/order-and-printer-flow.md).
