# Backend Handoff

Status date: 2026-06-07

Repository:
`https://github.com/tanjunnan0101/restaurant-qr-pos-backend`

## Latest Continuation Update

This repository was audited, repaired, and locally validated on 2026-06-07.
The main continuation-readiness work is already committed and the working tree
was clean at the end of the session.

Important commits:

- `429339b` - Repair workspace bootstrap and self-bootstrap Stripe smoke test
- `8fda96f` - Add concrete staging rollout runbook

What was repaired:

- Restored the root npm workspace manifest in `package.json` so the documented
  monorepo commands work again.
- Restored the missing `prisma:deploy` package script in
  `packages/db/package.json`.
- Fixed stale documentation links and aligned README/handoff/bootstrap steps
  with the actual repository state.
- Upgraded `scripts/stripe-e2e-smoke.ps1` so it no longer depends on hidden
  pre-created QA data. It now logs into the seeded demo tenant and creates a
  minimal published menu, table QR, and printer route when needed.
- Added a concrete staging rollout runbook at
  `docs/runbooks/staging-rollout.md`.

What was validated locally:

- `docker compose -f infra/compose.yaml up -d`
- `npm run prisma:generate`
- `npm run prisma:deploy`
- `npm run prisma:seed`
- `GET /api/v1/health` returning `status: ok` with PostgreSQL and Redis up
- `npm run check`
- `npm run smoke:stripe`

Smoke-test behaviors confirmed:

- Invalid Stripe signature is rejected.
- Card payment marks the order paid exactly once.
- Duplicate webhook delivery is ignored safely.
- A second success event does not release the kitchen twice.
- PayNow stays `PROCESSING` until the async success event arrives.
- PayNow async success releases the kitchen exactly once.
- Amount mismatch does not release the order.

Where to resume next time:

1. Use `docs/runbooks/staging-rollout.md` as the primary next-step checklist.
2. Choose the staging host/provider.
3. Provision managed PostgreSQL, managed Redis, DNS, HTTPS, and secrets.
4. Deploy the API image and run `npm run prisma:deploy` against staging.
5. Configure the Stripe test webhook and run one real card and one real PayNow
   flow.
6. Validate one real Windows printer-agent machine against the target thermal
   printer.
7. Only after staging is proven should work continue into staff POS, KDS,
   reporting, inventory, attendance, and the frontend applications.

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

The Stripe smoke script now boots a minimal published menu, dining table, and
printer route on the seeded demo tenant when they do not yet exist, so it can
validate a clean local database after migrations and seed data.

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
- Customer, POS, KDS, and owner frontend applications.
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
npm run smoke:stripe
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
- Printer agent: `apps/printer-agent/src`
- Prisma schema and migrations: `packages/db/prisma`
- Shared types: `packages/types`
- Architecture decisions: `docs/adr`
- Operational runbooks: `docs/runbooks`
- Staging rollout runbook: `docs/runbooks/staging-rollout.md`
- Deployment guide: `deployment.md`
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

After staging is stable, continue with the staff POS/KDS workflow.
