# Restaurant QR POS

Multi-tenant restaurant QR ordering platform with a live customer ordering
frontend, HitPay checkout, and local printer-agent support.

Start with [HANDOFF.md](HANDOFF.md) for the current continuation baseline. For
deployment and rollout, use:

- [docs/deployment.md](docs/deployment.md)
- [docs/runbooks/staging-rollout.md](docs/runbooks/staging-rollout.md)
- [docs/runbooks/production-readiness.md](docs/runbooks/production-readiness.md)

## Current baseline

Implemented now:

- NestJS API with Swagger, JWT auth, outlet-scoped RBAC, and tenant isolation.
- Prisma/PostgreSQL schema for restaurants, outlets, menus, tables, orders,
  payments, and print jobs.
- Customer QR ordering web app in `apps/customer-web`.
- Menu publishing, sold-out controls, table QR generation, and QR rotation.
- Server-priced order creation with idempotency protection.
- Hosted HitPay checkout for the public customer flow.
- Signed HitPay webhook processing and redirect reconciliation.
- Kitchen and bar ticket routing to printer queues after confirmed payment.
- Automatic customer receipt queueing when a `RECEIPT` printer is configured.
- Windows/LAN printer agent for ESC/POS thermal printers.
- One-call client onboarding and owner activation.
- Initial owner-web scaffold with activation, login, and read-only dashboard hydration.

Not implemented yet:

- Staff POS frontend.
- KDS frontend.
- Full owner dashboard write flows.
- Physical printer acceptance on a real outlet network.
- Production observability, rate limiting, backup/restore drills, and
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

Useful local URLs:

- Swagger: `http://localhost:3001/docs`
- API health: `http://localhost:3001/api/v1/health`
- Customer app shell: `http://localhost:3000`
- Owner app shell: `http://localhost:3002`

Seeded owner login defaults to `owner@example.com` / `ChangeMe123!` unless
you override them in `.env`.

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

The owner console now lives in `apps/owner-web` and currently supports:

- account activation
- owner login
- a read-only dashboard
- outlet menu visibility
- outlet table and QR visibility
- outlet payment-settings visibility
- outlet printing visibility

It is intentionally read-first for the first scaffold. The next phase is to add
write flows for menu setup, table setup, payment toggles, and printing setup.
