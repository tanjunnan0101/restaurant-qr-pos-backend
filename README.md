# Restaurant QR POS

Multi-tenant restaurant QR ordering platform with live customer, owner, and
staff web surfaces, HitPay checkout, and local printer-agent support.

Start with [HANDOFF.md](HANDOFF.md) for the current continuation baseline. For
deployment and rollout, use:

- [docs/deployment.md](docs/deployment.md)
- [docs/runbooks/staging-rollout.md](docs/runbooks/staging-rollout.md)
- [docs/runbooks/production-readiness.md](docs/runbooks/production-readiness.md)
- [docs/runbooks/backup-restore-drill.md](docs/runbooks/backup-restore-drill.md)

## Current baseline

Implemented now:

- NestJS API with Swagger, JWT auth, outlet-scoped RBAC, and tenant isolation.
- Prisma/PostgreSQL schema for restaurants, outlets, menus, tables, orders,
  payments, and print jobs.
- Customer QR ordering web app in `apps/customer-web`.
- Staff operations web app baseline in `apps/staff-web`.
- Menu publishing, sold-out controls, table QR generation, and QR rotation.
- Server-priced order creation with idempotency protection.
- Hosted HitPay checkout for the public customer flow.
- Signed HitPay webhook processing and redirect reconciliation.
- Kitchen and bar ticket routing to printer queues after confirmed payment.
- Automatic customer receipt queueing when a `RECEIPT` printer is configured.
- Windows/LAN printer agent for ESC/POS thermal printers.
- One-call client onboarding and owner activation.
- Owner-web with activation, login, dashboard hydration, and outlet setup flows.
- Staff-web with login, operations dashboard, orders board, and table overview.
- Configurable proxy-aware API rate limiting for auth, public QR, and admin
  traffic classes.
- Request lifecycle logging with request IDs, client IP capture, and slow/error
  request warnings.
- Configurable Swagger exposure for safer production deployments.

Not implemented yet:

- KDS frontend.
- Physical printer acceptance on a real outlet network.
- Error tracking hooks, centralized log shipping, proven restore drills, and
  horizontally scaled Socket.IO.

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and Redis with `docker compose -f infra/compose.yaml up -d`.
3. Run `npm install`.
4. Run `npm run prisma:generate`.
5. Run `npm run prisma:deploy`.
6. Run `npm run prisma:seed`.
7. Run `npm run dev`.
8. In a second terminal, run `npm run dev:customer`.
9. In a third terminal, run `npm run dev:owner`.
10. In a fourth terminal, run `npm run dev:staff`.

Useful local URLs:

- Swagger: `http://localhost:3001/docs`
- API health: `http://localhost:3001/api/v1/health`
- Customer app shell: `http://localhost:3000`
- Owner app shell: `http://localhost:3002`
- Staff app shell: `http://localhost:3003`

Seeded owner login defaults to `owner@example.com` / `ChangeMe123!` unless
you override them in `.env`.

## API hardening

The API now includes basic production safeguards for burst traffic:

- proxy-aware rate limiting for `auth`, `public`, and `admin` routes
- webhook, health, docs, and printer-agent exemptions
- request lifecycle logging with request IDs and slow/error warnings
- configurable Swagger enable or disable behavior per environment
- optional server-error webhook forwarding for 5xx events
- configurable limits through `.env`

Relevant environment variables:

- `API_TRUST_PROXY`
- `SWAGGER_ENABLED`
- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_AUTH_WINDOW_MS`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_PUBLIC_WINDOW_MS`
- `RATE_LIMIT_PUBLIC_MAX`
- `RATE_LIMIT_ADMIN_WINDOW_MS`
- `RATE_LIMIT_ADMIN_MAX`
- `REQUEST_LOGGING_ENABLED`
- `REQUEST_LOGGING_SLOW_MS`
- `ERROR_TRACKING_ENABLED`
- `ERROR_WEBHOOK_URL`

## Public checkout flow

The live customer payment method is:

- `ONLINE_CARD`

That method currently maps to hosted HitPay card or wallet checkout. Public
PayNow has been removed from the QR customer flow.

Key endpoints:

- `POST /api/v1/public/qr/:publicCode/:token/orders`
- `POST /api/v1/public/qr/:publicCode/:token/orders/:orderId/payment`
- `POST /api/v1/webhooks/hitpay`

See [docs/runbooks/hitpay-checkout-webhooks.md](docs/runbooks/hitpay-checkout-webhooks.md).

## Payment controls

Outlet operators can disable payment scopes through:

- `POST /api/v1/admin/outlets/:outletId/payment-settings/disable`
- `POST /api/v1/admin/outlets/:outletId/payment-settings/enable`

Current customer-relevant scopes:

- `ONLINE`
- `ONLINE_CARD`

There are still legacy internal field names containing `stripe` in the schema
and some service responses. Those names currently gate the hosted checkout path
and are safe to leave in place until a later schema cleanup.

## Printing

Printing setup is configured through:

- `POST /api/v1/admin/outlets/:outletId/printing/setup`

The printer agent runs on a Windows machine inside the restaurant's Wi-Fi/LAN
network and sends ESC/POS output directly to local printer IPs, normally on TCP
port `9100`.

When payment is confirmed:

- Kitchen or bar tickets are queued by station route.
- One customer receipt is also queued if an active printer with role
  `RECEIPT` exists.

See [docs/runbooks/order-and-printer-flow.md](docs/runbooks/order-and-printer-flow.md).

## Owner web

The owner console in `apps/owner-web` currently supports:

- account activation
- owner login
- dashboard hydration
- outlet menu management
- outlet table and QR setup
- outlet payment-settings controls
- outlet printing configuration and retry/test flows

## Staff web

The staff console in `apps/staff-web` currently supports:

- staff login through the live JWT auth flow
- accessible outlet dashboard with live queue summaries
- outlet order board with status progression from kitchen release to completion
- outlet table overview
- a reserved POS continuation route for walk-in order entry

The next phase is to turn the POS continuation route into full walk-in order
entry and settlement tooling.
