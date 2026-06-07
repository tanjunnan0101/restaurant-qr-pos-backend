# Backend Handoff

Status date: 2026-06-08

Repository:
`https://github.com/tanjunnan0101/restaurant-qr-pos-backend`

## Current state

This repository is continuation-ready for the backend, the customer QR web app,
the owner-web scaffold, and the printer-agent foundation.

Current deployed/staging truth at the end of this session:

- Render API and customer web deployment are up.
- Render PostgreSQL and Redis are connected and healthy.
- HitPay sandbox checkout is working end to end.
- Successful payments are visible in the HitPay sandbox dashboard.
- The customer QR menu flow is working.
- The remaining unvalidated area is physical printer hardware.

The live customer checkout baseline is now:

- Hosted HitPay checkout only.
- Public payment method key `ONLINE_CARD`.
- No public PayNow checkout path.
- Signed HitPay webhooks at `POST /api/v1/webhooks/hitpay`.
- Redirect reconciliation on the customer return page.

The repo now also includes automatic customer receipt queueing after successful
payment when an active printer with role `RECEIPT` is configured for the outlet.

The repo now also includes a scaffolded owner-web application for restaurant
owners and outlet admins. It is built as a shared multi-client frontend: one
owner-web domain can serve all restaurant clients, and each client signs in with
their company slug, owner email, and password.

## Most important recent work

1. Migrated the customer payment flow from Stripe to HitPay.
2. Normalized the active public payment method from `STRIPE_CARD` to
   `ONLINE_CARD`.
3. Removed stale Stripe-era customer checkout wording from the main docs and
   handoff.
4. Added automatic customer receipt rendering and queueing alongside the
   existing kitchen and bar tickets.
5. Added continuation placeholders for the future `staff-web` and `owner-web`
   applications.
6. Scaffolded the `owner-web` Next.js app with owner activation, login,
   dashboard, menu, table/QR, payment-settings, and printing routes.
7. Added owner-web design-system notes and monorepo script wiring so build,
   typecheck, and lint include the new app.

## What is implemented

- NestJS API with Swagger and health checks.
- PostgreSQL/Prisma multi-tenant backend.
- JWT login, roles, permissions, and outlet access control.
- Client onboarding and owner activation.
- Menu setup, versioning, publishing, and sold-out controls.
- Dining zones, tables, QR generation, and QR rotation.
- Public QR resolution with live payment availability.
- Server-priced idempotent QR order creation.
- Hosted HitPay checkout and signed webhook processing.
- Kitchen release only after confirmed payment.
- Print-job persistence, retry logic, backup routing, and printer-agent lease flow.
- Customer receipt queueing after successful payment.
- Next.js customer ordering app.
- Next.js owner-web scaffold.
- Dockerfiles for API, customer web, and migration job.

## What is not implemented yet

- Staff POS frontend.
- KDS frontend.
- Owner/admin frontend API integration and session management.
- Real outlet printer validation on physical hardware.
- Authenticated Socket.IO subscriptions.
- Production rate limiting and abuse protection.
- Error tracking, alerting, and backup/restore drills.
- Full reporting, inventory, attendance, and operational dashboards.

## What was validated locally

- `npm run check`
- `npm run prisma:generate`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run lint`
- Targeted Prettier check for the owner-web scaffold files.
- One-shot HTTP verification of the owner-web landing, login, activation,
  dashboard, payment-settings, and printing pages.

The customer-receipt printing change was validated through typecheck, tests,
and build. Physical printer testing was intentionally skipped because printer
hardware is not available yet. The owner-web scaffold was validated through
typecheck, lint, build, and local HTTP page checks. It currently uses static
demo data and is ready for API wiring.

## What was validated in deployed staging

- `GET /api/v1/health` returned `status: ok`.
- Customer QR menu URL loaded successfully in the deployed customer web app.
- A real HitPay sandbox payment completed successfully through the hosted
  checkout flow.
- Paid orders were recorded correctly and visible in the HitPay sandbox
  dashboard.
- The deployed flow now shows HitPay, not Stripe, to the customer.

## Required deployment notes

For staging or production, the important API environment variables are:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `PLATFORM_ADMIN_API_KEY`
- `OWNER_APP_BASE_URL`
- `CUSTOMER_APP_BASE_URL`
- `HITPAY_API_KEY`
- `HITPAY_WEBHOOK_SALT`
- `HITPAY_API_URL`

Important:

- Rotate any HitPay sandbox keys or webhook salts that were ever pasted into
  chat, screenshots, or temporary notes.
- Do not commit `.env`, payment secrets, database credentials, or printer-agent
  keys.

## Current topology

The intended topology remains:

- One shared cloud API for all restaurant tenants.
- One managed PostgreSQL database.
- One managed Redis instance.
- One customer ordering frontend deployment.
- Future shared staff and owner frontends.
- One printer-agent machine per outlet network as needed.

Each restaurant is a tenant inside the same system. This is not one separate
backend deployment per restaurant.

## First local run

```powershell
git clone https://github.com/tanjunnan0101/restaurant-qr-pos-backend.git
cd restaurant-qr-pos-backend
Copy-Item .env.example .env
npm install
docker compose -f infra/compose.yaml up -d
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

In a second terminal:

```powershell
npm run dev:customer
```

For the owner/admin scaffold:

```powershell
npm run dev:owner
```

Owner web runs on `http://localhost:3101` locally. Port `3001` is avoided
because it is commonly occupied by Docker/WSL on this Windows machine.

Useful checks:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
npm run test
npm run build
```

## Where the next developer should resume

1. Use `docs/runbooks/staging-rollout.md` and
   `docs/runbooks/production-readiness.md` as the operational checklist.
2. Do not block continuation on printer validation. Go straight into
   `owner-web` integration first.
3. Wire `apps/owner-web` to the existing API:
   - `POST /auth/activate`
   - `POST /auth/login`
   - `GET /admin/outlets`
   - menu setup and publish routes
   - table/QR setup and rotation routes
   - payment-settings enable/disable routes
   - printing setup and test-print routes
4. Add owner session handling, selected-outlet state, API error states, and
   route protection.
5. Replace owner-web demo data with live backend data and keep the one-domain,
   multi-client login model.
6. Validate one real Windows printer-agent machine against the target thermal
   printer later, including the new customer-receipt output.
7. Decide whether to do a deeper schema cleanup of legacy internal `stripe_*`
   column names after staging is stable.
8. Continue the next frontend phase:
   - `apps/staff-web`
   - owner-web API wiring and forms

The payment flow no longer needs rescue work unless HitPay credentials are
rotated or the deployment environment changes.

## Important paths

- API: `apps/api/src`
- Customer web: `apps/customer-web`
- Owner web: `apps/owner-web`
- Printer agent: `apps/printer-agent/src`
- Future staff app placeholder: `apps/staff-web`
- Prisma schema and migrations: `packages/db/prisma`
- Runbooks: `docs/runbooks`
- Deployment guide: `docs/deployment.md`

## Remaining technical debt to be aware of

- Some internal schema fields and service response properties still use legacy
  `stripe*` names even though the live provider is now HitPay.
- The obsolete enum value `STRIPE_PAYNOW` still exists in the schema for safer
  compatibility, but it is no longer used in the public customer flow.
- There is no local fake payment-provider harness anymore; meaningful payment
  validation should happen against deployed HitPay sandbox endpoints.
