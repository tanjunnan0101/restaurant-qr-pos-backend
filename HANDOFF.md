# Backend Handoff

Status date: 2026-06-07

Repository:
`https://github.com/tanjunnan0101/restaurant-qr-pos-backend`

## Product Shape

This is a multi-tenant SaaS backend for approximately ten restaurant clients.
It is not an installed mobile-app backend and it is not deployed once per
restaurant.

The intended topology is:

- One cloud-hosted NestJS API for all clients.
- One managed PostgreSQL database with tenant isolation by `company_id` and
  `outlet_id`.
- One managed Redis service.
- Browser-based customer QR ordering, staff POS/KDS, and owner applications
  connecting to the API.
- One local printer agent at each restaurant that can reach its Wi-Fi/LAN
  printers and the cloud API.

Each restaurant receives its own login and isolated company/outlet data. A
custom domain per client is not required for the initial ten-client rollout.

## Implemented

- TypeScript npm-workspace monorepo.
- NestJS REST API, Swagger, health endpoint, and Socket.IO event publishing.
- PostgreSQL/Prisma schema and migrations.
- JWT authentication, tenant isolation, outlet access, roles, and permissions.
- One-call client onboarding and owner activation.
- Payment availability controls for online payments, Stripe, Stripe card,
  Stripe PayNow, and manual PayNow.
- Menu versioning, publishing, modifiers, variants, and sold-out controls.
- Dining-zone, table, and secure rotatable QR setup.
- Server-priced and idempotent public QR order creation.
- Manual PayNow verification.
- Stripe-hosted card and PayNow Checkout.
- Signed Stripe webhook processing, amount validation, event deduplication,
  and one-time kitchen release.
- Kitchen tickets, persisted print jobs, retry/backup routing, and test prints.
- ESC/POS LAN printer agent.
- Docker API image and local PostgreSQL/Redis Compose services.
- Mobile-first Next.js customer QR ordering app.
- Menu search, variants, required and optional modifiers, item remarks, and a
  session-persisted cart.
- Checkout totals, effective payment-method selection, Stripe Checkout
  redirects, manual PayNow handoff, and payment result polling.
- Production customer web Docker image.
- Unit tests and a local Stripe webhook smoke harness.

## Proven Checks

The following passed before this handoff:

- `npm run check`
- Twelve API unit tests.
- Stripe card and asynchronous PayNow smoke scenarios.
- Invalid Stripe signature rejection.
- Duplicate-event and second-success protection.
- Amount-mismatch rejection.
- Production Docker image build.
- Container `/api/v1/health` with PostgreSQL and Redis available.
- Customer web typecheck, lint, and production build.
- Customer web Docker image and live-container HTTP check.
- Mobile browser walkthrough covering required modifiers, modifier pricing,
  cart persistence, totals, and all enabled payment methods.

The Stripe smoke script expects the existing QA tenant, published menu, table,
and printer route. It is not yet a clean-database bootstrap test.

## Not Implemented

- Cloud staging or production infrastructure.
- CI/CD deployment to a selected cloud provider.
- Real Stripe test-account and live-account validation.
- Authenticated Socket.IO room subscription.
- Production rate limiting and abuse protection.
- Production observability, alerting, and backup-restore drills.
- Staff user-management APIs beyond onboarding defaults.
- Full KDS station-specific views and bump workflows.
- Inventory recipes, stock movement, deduction, and wastage.
- Reporting, reconciliation, exports, and owner dashboards.
- Employee attendance and clock-in/out.
- Staff POS, KDS, and owner frontend applications.
- Packaging the printer agent as a supervised Windows service/installer.

## First Local Run

Requirements:

- Node.js 24
- Docker Desktop
- PowerShell on Windows for the helper scripts

```powershell
git clone https://github.com/tanjunnan0101/restaurant-qr-pos-backend.git
cd restaurant-qr-pos-backend
Copy-Item .env.example .env
```

Replace the placeholder secrets in `.env`, then run:

```powershell
npm ci
docker compose -f infra/compose.yaml up -d
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

Verify:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
npm run check
```

Swagger is available at `http://localhost:3001/docs`.

The default seeded development login comes from `SEED_OWNER_EMAIL` and
`SEED_OWNER_PASSWORD` in `.env`.

## Development Rules

- Use integer cents for money.
- Treat Stripe webhooks, not browser redirects, as payment truth.
- Do not release an order to the kitchen before confirmed payment.
- Preserve idempotency for order, Checkout, verification, and webhook paths.
- Derive tenant and outlet access from authenticated server context.
- Store print requests before attempting local network delivery.
- Add a Prisma migration for every schema change.
- Run `npm run check` before pushing.
- Never commit `.env`, Stripe secrets, database credentials, or printer-agent
  keys.

## Important Paths

- API: `apps/api/src`
- Customer web app: `apps/customer-web`
- Printer agent: `apps/printer-agent/src`
- Prisma schema and migrations: `packages/db/prisma`
- Shared types: `packages/types`
- Architecture decisions: `docs/adr`
- Operational runbooks: `docs/runbooks`
- Deployment guide: `docs/deployment.md`
- Docker assets: `infra`

## Recommended Next Milestone

Deploy a staging environment first:

1. Select the cloud provider.
2. Provision managed PostgreSQL and Redis.
3. Deploy the API Docker image at `api-staging.<domain>`.
4. Configure secrets and run `npm run prisma:deploy`.
5. Configure a Stripe test webhook.
6. Run one real Stripe card payment and one real PayNow payment.
7. Pilot the local printer agent against the intended physical printer.
8. Add monitoring and a database restore test.

After staging is stable, continue with the staff POS/KDS workflow. The
customer web app is ready for staging integration, but real Stripe test-mode
payments still require deployed callback URLs and a configured webhook.
