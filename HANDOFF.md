# Backend Handoff

Status date: 2026-06-08

Repository:
`https://github.com/tanjunnan0101/restaurant-qr-pos-backend`

## Current state

This repository is continuation-ready for the backend, the customer QR web app,
the owner web app, the staff web baseline, and the printer-agent foundation.

Current deployed/staging truth at the end of this session:

- Render API and customer web deployment are up.
- Render PostgreSQL and Redis are connected and healthy.
- HitPay sandbox checkout is working end to end.
- Successful payments are visible in the HitPay sandbox dashboard.
- The customer QR menu flow is working.
- The owner web app is implemented and wired to the live backend APIs.
- The staff web baseline is implemented and wired to live order, table, menu,
  and payment APIs.
- Customer-web fallback copy now directs guests to the cashier when online
  payment is unavailable.
- Staff POS now has a live `ONLINE_CARD` on/off toggle backed by the outlet
  payment-settings API.
- Owner-web now exposes the same `ONLINE_CARD` business toggle prominently in
  payment settings.
- Staff order operations now support authenticated live outlet updates through
  Socket.IO subscriptions.
- A first KDS screen now exists inside `apps/staff-web` for outlet kitchen
  queue handling.
- Attendance management is now implemented in both owner-web and staff-web,
  backed by live attendance APIs.
- Inventory Lite is now implemented end to end:
  - Prisma schema and migration for inventory items, recipes, ingredients, and
    stock movements
  - admin inventory APIs for item master, stock in/out, wastage, stock count,
    and recipe mapping
  - owner-web and staff-web inventory screens for operational usage
- Advanced cashier features are now partially implemented:
  - held draft tickets using `OrderStatus.DRAFT`
  - order-level discounts with backend repricing
  - pre-payment bill printing from POS
  - automatic sale deduction movements when orders are released to kitchen
- The remaining unvalidated area is physical printer hardware.
- Phase 4 has now started locally with configurable API rate limiting and
  abuse-protection middleware. This hardening block still needs deployment
  validation on staging or production.
- Phase 4 now also includes request lifecycle logging, production Swagger
  toggling, and a backup or restore drill runbook.
- Phase 4 now also includes a generic 5xx error webhook hook for future alert
  routing.

The live customer checkout baseline is now:

- Hosted HitPay checkout only.
- Public payment method key `ONLINE_CARD`.
- No public PayNow checkout path.
- Signed HitPay webhooks at `POST /api/v1/webhooks/hitpay`.
- Redirect reconciliation on the customer return page.

The repo now also includes automatic customer receipt queueing after successful
payment when an active printer with role `RECEIPT` is configured for the outlet.

## Most important recent work

1. Migrated the customer payment flow from Stripe to HitPay.
2. Normalized the active public payment method from `STRIPE_CARD` to
   `ONLINE_CARD`.
3. Removed stale Stripe-era customer checkout wording from the main docs and
   handoff.
4. Added automatic customer receipt rendering and queueing alongside the
   existing kitchen and bar tickets.
5. Replaced the placeholder `owner-web` app with a real Next.js owner console.
6. Added the first owner-web write flows for payment settings, tables/QR,
   menu maintenance including advanced menu controls, and printing actions.
7. Replaced the placeholder `staff-web` app with a real Next.js operations
   baseline for staff login, live orders, and table visibility.
8. Started Phase 4 by adding proxy-aware, configurable API rate limiting for
   auth, public QR, and admin traffic.
9. Added request lifecycle logging, configurable Swagger exposure, and a
   backup or restore drill runbook for Phase 4 operations.
10. Added an injectable 5xx error tracking hook that can forward incidents to a
    configured webhook without committing to a vendor yet.
11. Added authenticated outlet realtime subscriptions for staff operations.
12. Added an initial KDS view in staff-web backed by the existing order APIs
    and outlet realtime events.
13. Updated the customer online-payment fallback copy to point guests to the
    cashier instead of generic staff help.
14. Added a live cashier-side `ONLINE_CARD` toggle in staff POS backed by the
    outlet payment-settings API.
15. Surfaced the same `ONLINE_CARD` toggle as a top-level owner-web payment
    control for consistency across admin and cashier flows.
16. Built the attendance module with owner/staff views, live settings, and
    approval or adjustment flows.
17. Built Inventory Lite across backend, owner-web, and staff-web with item
    master, stock movements, low-stock visibility, and recipe/BOM mapping.
18. Extended cashier order flow with held drafts, order-level discounts,
    pre-payment bill printing, and automatic inventory deduction on kitchen
    release.

## Entire work completed so far

### Backend and platform

- Built the NestJS multi-tenant backend with JWT auth, RBAC, outlet scoping,
  Swagger, and health checks.
- Implemented platform onboarding so a new restaurant tenant, owner user,
  outlet, tables, menus, and activation flow can be provisioned from the API.
- Added outlet management, menu management, table and QR management, payment
  controls, order flows, and printing flows under the admin API.
- Added proxy-aware rate limiting middleware with separate auth, public, and
  admin traffic buckets, while exempting health, webhook, docs, and
  printer-agent routes.
- Added request lifecycle logging with request IDs, client IP capture, and
  slow or error request warnings.
- Added a configuration path to disable Swagger in production while keeping it
  available in local or staging environments when desired.
- Added a generic server-error tracking hook so 5xx events can be forwarded to
  an incident webhook through configuration.
- Added an attendance module with settings, clock-in/out, review, approval,
  and adjustment flows under outlet-scoped admin APIs.
- Added Inventory Lite persistence and APIs:
  - inventory item master
  - stock movement register
  - stock in, wastage, manual adjustment, and stock count actions
  - recipe/BOM mapping for menu items
  - sale-linked stock deduction when orders are released to kitchen

### Customer ordering flow

- Built the customer QR ordering frontend in `apps/customer-web`.
- Implemented QR resolution, menu browsing, cart flow, server-priced order
  creation, and hosted payment redirect handling.
- Removed public Stripe checkout and migrated the live customer payment path to
  HitPay hosted checkout only.
- Verified that paid orders now complete successfully and appear in the HitPay
  sandbox dashboard.

### Payments

- Replaced the customer Stripe checkout path with HitPay.
- Added HitPay payment request creation, webhook processing, and redirect
  reconciliation.
- Normalized the customer-facing online payment method to `ONLINE_CARD`.
- Left legacy internal `stripe*` names in place only where needed for safe
  compatibility, not because Stripe is still the active public provider.

### Printing

- Built printer setup and printer-agent support for LAN/Wi-Fi style outlet
  printing.
- Implemented kitchen and bar ticket release after confirmed payment.
- Added automatic customer receipt queueing when a `RECEIPT` printer is
  configured.
- Added retry, reprint, test-print, lease, heartbeat, and job-complete/fail
  flows.
- Physical printer validation is still pending because no real printer hardware
  is available yet.

### Owner web

- Replaced the owner-web placeholder with a real Next.js app.
- Added owner activation and login using the live backend auth endpoints.
- Hydrated the owner dashboard from real backend APIs.
- Added outlet menu management flows including menu setup, draft replacement,
  clone-to-draft, publish, and sold-out toggles.
- Upgraded the owner menu workspace with a structured draft editor for:
  - modifier groups and option pricing
  - item-level modifier-group assignment
  - item variants and price deltas
  - direct category and item editing without relying only on a raw textarea
  - draft readiness checks and draft-vs-published comparison summaries before
    publish
- Added table and QR setup flows including QR rotation.
- Added payment-settings controls and printing configuration/test/retry flows.
- Added owner attendance workspace and attendance settings/review actions.
- Added owner inventory workspace for:
  - creating inventory items
  - recording stock movements
  - reviewing low-stock items and recent movements
  - mapping recipe/BOM deduction from published menu items
- Added first owner reporting snapshots on the dashboard using existing admin
  order list endpoints:
  - outlet order counts
  - live order counts
  - paid order counts
  - gross paid sales totals
- Added a dedicated owner outlet reporting page at
  `apps/owner-web/app/outlets/[outletId]/reports/page.tsx` with:
  - 24-hour, 7-day, 30-day, and all-time filters
  - gross paid sales, average paid ticket, unpaid exposure, and live-order
    metrics
  - status distribution and payment-method mix
  - top-table activity and recent-order summaries
  - lightweight trend views, previous-period comparisons, and export-ready
    owner summary text

### Staff web

- Replaced the staff-web placeholder with a real Next.js app baseline.
- Added staff login using the live JWT auth flow.
- Added a staff dashboard with outlet-level live queue and table summaries.
- Added a live orders board with status progression from kitchen release through
  completion.
- Added authenticated realtime sync for the staff order board so outlet events
  can refresh the queue without manual reload.
- Added a table overview screen.
- Added a real walk-in POS composer with menu browsing, cart building, dine-in
  table selection, customer capture, and order submission.
- Added a first KDS screen at
  `apps/staff-web/app/outlets/[outletId]/kds/page.tsx` with:
  - live outlet subscription through the authenticated operations namespace
  - kitchen-stage queue columns for `SENT_TO_KITCHEN`, `PREPARING`, and `READY`
  - ticket detail view with items, modifiers, and kitchen ticket status
  - kitchen-side status progression actions using the existing order-status API
- Added staff payment recovery actions from the order board:
  - create or reopen HitPay hosted checkout for unpaid online-card orders
  - verify manual PayNow payments and release those orders into the kitchen flow
  - void unpaid or payment-processing orders before kitchen release
  - reopen unpaid staff-assisted orders in POS edit mode and save amendments
- Added additive backend admin endpoints for:
  - staff POS order creation
  - admin checkout creation
  - manual PayNow verification using `order.manage`
  - order cancellation for pre-kitchen cashier recovery
  - unpaid order amendment for staff-assisted orders
- Added staff cash settlement support:
  - new `CASH` payment method in payment settings and Prisma enums
  - owner-visible toggle in payment settings
  - POS-side cash option that marks the order paid immediately
  - immediate kitchen release for cash-settled orders
- Added cashier UX polish on the staff POS:
  - menu search across categories, item names, descriptions, and prep stations
  - cash tendered entry with exact-cash shortcut
  - live change-due or still-due calculation before cash settlement
  - clearer post-submit actions for new-ticket reset and quick jump back to the
    orders board
  - cart-line editing so staff can reopen an item and update quantity,
    variants, modifiers, or remarks before saving the ticket
- Added advanced cashier workflow improvements:
  - hold ticket as draft and reopen it later from the orders board
  - order-level percentage or fixed-amount discounts
  - pre-payment bill printing directly from POS edit mode
  - draft-aware POS amendment flow for both held and unpaid staff-assisted
    orders
- Added live POS-side payment availability awareness using the payment-settings
  API so the cashier payment method list respects outlet settings.
- Added a cashier-side `ONLINE_CARD` toggle in staff POS:
  - uses existing owner/admin payment-settings APIs
  - updates outlet payment availability immediately
  - automatically removes online-card checkout from the POS method picker when
    disabled
  - falls back to other enabled methods if online-card is turned off mid-flow
- Added a defensive HitPay webhook guard so locally cancelled orders do not get
  revived by late payment status callbacks.
- Added staff attendance workspace using the live attendance APIs.
- Added staff inventory workspace for day-to-day stock entry, low-stock
  visibility, and recipe deduction setup.

### Documentation and continuation

- Updated the main repo README, deployment context, design-system notes, and
  handoff documentation to reflect the current architecture and active payment
  provider.
- Added a backup or restore drill runbook for production readiness.
- Preserved the repo as continuation-ready so the next developer can continue
  from owner-web and staff-web baselines instead of scaffolding again.

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
- Next.js owner/admin app with login, activation, dashboard hydration, and
  outlet management surfaces.
- Next.js staff operations app with login, dashboard, order queue, tables
  overview, and a real walk-in POS workflow.
- Attendance module in backend, owner-web, and staff-web.
- Inventory Lite module in backend, owner-web, and staff-web.
- Shared owner and cashier business controls for outlet-level `ONLINE_CARD`
  availability.
- Dockerfiles for API, customer web, and migration job.

## What is not implemented yet

- Split-tender, split-bill, refund, void-ticket, and deeper cashier settlement
  features beyond the current draft, discount, online-card, manual-PayNow,
  cash, and pre-payment-bill baseline.
- Real outlet printer validation on physical hardware.
- Deployed validation of production rate limiting, request logging, and Swagger
  exposure settings.
- Error tracking, centralized log shipping, and operational alerting.
- Deeper reporting and analytics beyond the current first owner reporting,
  attendance, and inventory snapshots.
- Deeper KDS workflow such as station filtering, expo views, and richer kitchen
  event payloads.
- Role or access-management UX for adjusting cashier payment-control permission
  on already-existing staff users if needed operationally.

## Remaining development work

### Highest priority next

- Decide whether to keep KDS inside `apps/staff-web` or split it into a
  dedicated future app after the first in-app KDS iteration.
- Expand the new realtime-backed KDS flow with station filtering, expo
  handoff, and richer kitchen-stage behavior.
- Decide which advanced cashier items should come next after the current draft
  and discount baseline:
  - split bill
  - split tender
  - refunds or void tickets
  - cashier close-out workflow

### Frontend work still open

- Expand the initial KDS frontend into a fuller kitchen and expo product.
- Richer menu editing UX in owner-web for modifier groups, item variants, and
  easier structured editing.
- Finer-grained table/floor editing UX in owner-web if visual table management
  is desired.
- Full reporting and operational dashboards for owners or managers.
- Inventory analytics views such as usage trend, low-stock history, and recipe
  coverage health.
- Attendance reporting views such as daily summary, lateness flags, and export.

### Hardware and operations work still open

- Validate one real Windows printer-agent machine with a real thermal printer.
- Confirm kitchen receipt, customer receipt, retry, and reprint behavior on
  real outlet hardware and LAN conditions.
- Add production rate limiting, abuse protection, alerting, and backup/restore
  drills.
- Extend the authenticated realtime delivery now in place if the staff or KDS
  flow needs richer event-driven UX than refresh-triggered updates.

### Technical cleanup still open

- Decide whether to rename legacy internal `stripe_*` schema and response fields
  now that HitPay is the live provider.
- Consider removing the obsolete `STRIPE_PAYNOW` enum path after the team is
  confident no compatibility path still depends on it.

## Four-phase delivery split

Use the remaining work in four separate phases so different developers can work
in parallel with controlled merge overlap.

Recommended merge sequence:

1. Build Phase 1 and Phase 2 in parallel.
2. Merge Phase 1 and Phase 2 together into one integration branch.
3. Build Phase 3 and Phase 4 in parallel.
4. Merge Phase 3 and Phase 4 together into one integration branch.
5. Merge the combined `phase-1 + phase-2` branch with the combined
   `phase-3 + phase-4` branch last.

This creates two logical tracks:

- Operations product track: Phase 1 + Phase 2
- Admin and hardening track: Phase 3 + Phase 4

### Phase 1: Staff POS core

Goal:

- Turn `apps/staff-web` from an operations board into a real walk-in POS.

Current implementation status:

- Completed and ready for merge.
- Implemented now:
  - walk-in order composer at
    `apps/staff-web/app/outlets/[outletId]/pos/page.tsx`
  - menu browsing and customization-aware cart building
  - dine-in table assignment and non-dine-in order support
  - customer name and phone capture
  - staff order creation through admin order APIs
  - immediate HitPay checkout creation for online-card orders
  - manual PayNow order creation path
  - cash payment path with immediate settlement and kitchen release
  - menu search for faster cashier lookup
  - cash tender capture with live change-due calculation
  - cart-line editing for quantity, remarks, variants, and modifiers
  - clearer success-state actions after submit
  - order-board payment actions to reopen HitPay checkout or verify manual
    PayNow
  - order-board void flow for unpaid or payment-processing orders
  - order-board entry into POS edit mode for unpaid staff-assisted orders
  - server-side amendment of unpaid staff-assisted orders with repricing and
    payment reset
  - held draft tickets using `OrderStatus.DRAFT`
  - order-level discounts
  - pre-payment bill printing from cashier flow
- Phase 1 close-out decision:
  - split tenders, split bills, refunds, and deeper cashier close-out remain
    outside the current Phase 1 close-out
  - if product wants those later, treat them as the next cashier enhancement
    stream rather than reopening the initial POS baseline

Scope:

- Build the walk-in order composer in
  `apps/staff-web/app/outlets/[outletId]/pos/page.tsx`
- Add menu browsing for staff POS
- Add cart building for dine-in and takeaway
- Add table selection for dine-in orders
- Add customer name and phone capture for walk-in orders
- Add payment choice UI for staff-controlled settlement paths
- Add order submission flow using backend APIs
- Add post-submit order detail or confirmation state

Expected backend work:

- Only additive API work if needed for staff POS order creation
- Keep changes contained to order creation, payments, and staff POS DTO paths
- Do not rewrite owner-web or printing contracts unless required

Primary ownership:

- `apps/staff-web`
- possibly `apps/api/src/orders`
- possibly `apps/api/src/payments`

Definition of done:

- Staff can create a walk-in order from the staff app
- The order is stored correctly in the backend
- The order appears correctly in the staff order board
- Staff can continue settlement from the order board for HitPay or manual
  PayNow
- Staff can settle cash orders with tendered/change guidance
- Staff can edit cart lines before saving the ticket
- Existing QR customer ordering is not broken

### Phase 2: KDS and live operations

Goal:

- Build the kitchen display system and real-time service update flow.

Current implementation status:

- Started and continuation-ready.
- Implemented now:
  - authenticated Socket.IO outlet subscriptions in
    `apps/api/src/realtime`
  - live queue refresh wiring in
    `apps/staff-web/components/outlet-orders-page.tsx`
  - first KDS route in
    `apps/staff-web/app/outlets/[outletId]/kds/page.tsx`
  - first KDS screen in
    `apps/staff-web/components/outlet-kds-page.tsx`

Scope:

- Decide and implement KDS as either:
  - a new `apps/kds-web`
  - or continue the new dedicated KDS mode inside `apps/staff-web`
- Build a kitchen queue screen
- Show tickets by status such as new, preparing, ready, completed
- Add station filtering if needed
- Add status actions for kitchen staff
- Wire event updates for:
  - payment confirmed
  - kitchen ticket created
  - order status changed

Expected backend work:

- Stable realtime event payload shapes
- Possibly station-focused read endpoints if existing order endpoints are not
  enough

Primary ownership:

- `apps/api/src/realtime`
- `apps/api/src/orders`
- `apps/staff-web` or `apps/kds-web`

Definition of done:

- Kitchen screens update without manual refresh
- Staff or KDS can move orders through preparation states
- Newly paid orders appear in the live queue quickly
- Remaining work is now refinement, richer payloads, and optional dedicated KDS
  app separation rather than first-time scaffolding

Why Phase 1 and Phase 2 are mergeable:

- Phase 1 is mainly staff POS order creation
- Phase 2 is mainly kitchen consumption and realtime delivery
- Shared backend overlap exists in orders, but it should remain manageable if
  both phases keep API changes additive and avoid rewriting the same contracts

### Phase 3: Owner web advanced management

Goal:

- Improve owner-web from a usable baseline into a stronger operator-facing admin
  product.

Current implementation status:

- Completed for the currently agreed scope and ready for merge.
- Implemented now:
  - structured owner menu draft editor for modifier groups, option pricing,
    item variants, and item-level modifier assignment
  - clearer draft publish workflow with readiness checks and change summaries
  - first reporting snapshot on the owner dashboard using existing order list
    APIs for total orders, live orders, paid orders, and gross paid sales
  - dedicated outlet reporting route with time-window filters and richer
    trading summaries
  - trend-style reporting, previous-period comparisons, and export-ready owner
    summaries
- Phase 3 close-out decision:
  - visual floor/table editing is deferred out of this phase
  - outlet-to-outlet comparison dashboards and richer exports can be treated as
    future enhancements rather than blockers for Phase 3 completion

Scope:

- Replace text-heavy menu editing with a richer structured editor
- Add modifier-group and item-variant management UX
- Improve draft and publish workflow clarity
- Add finer table or floor editing UX if visual management is desired
- Improve QR export and regenerate workflows
- Add first reporting screens such as:
  - sales overview
  - outlet summary
  - order volume summary

Expected backend work:

- Reuse existing endpoints first
- Add read-only reporting endpoints only if needed
- Avoid touching staff POS or KDS contracts unless unavoidable

Primary ownership:

- `apps/owner-web`
- possibly reporting endpoints in `apps/api/src`

Definition of done:

- Owner can manage menus without relying on raw text editing alone
- Owner table management is clearer
- Owner sees useful business-level summaries

### Phase 4: Production hardening and hardware validation

Goal:

- Make the system safer and more deployment-ready while validating printing on
  real hardware.

Scope:

- Validate one real Windows printer-agent machine with a real thermal printer
- Test kitchen receipt, customer receipt, retry, and reprint on actual outlet
  hardware and LAN conditions
- Add production rate limiting or abuse protection
- Add error tracking hooks
- Improve operational logging where useful
- Define backup and restore drill steps
- Review and clean legacy internal `stripe_*` naming where safe
- Decide whether to deprecate the `STRIPE_PAYNOW` compatibility path

Current Phase 4 progress:

- Completed locally:
  - Configurable API rate limiting middleware is implemented.
  - Separate auth, public QR, and admin rate-limit policies exist.
  - Proxy-aware client resolution is supported through `API_TRUST_PROXY`.
  - Health, docs, HitPay webhook, and printer-agent routes are exempted.
  - Request lifecycle logging is implemented with request IDs, duration, and
    warning or error escalation.
  - Swagger exposure is configurable through `SWAGGER_ENABLED`.
  - The global exception filter can forward 5xx events to `ERROR_WEBHOOK_URL`
    when enabled.
  - Backup or restore drill steps are documented in
    `docs/runbooks/backup-restore-drill.md`.
  - Middleware tests, API typecheck, and API build are passing.
- Still remaining:
  - Deploy the Phase 4 env vars to staging or production and verify
    rate-limit headers, request logs, Swagger exposure, and the error webhook
    path on Render.
  - Validate one real Windows printer-agent machine with a real thermal
    printer.
  - Confirm kitchen receipt plus customer receipt behavior on physical outlet
    hardware.
  - Point the generic error hook at the team's real incident destination, then
    add centralized log shipping and alerting.
  - Run the backup or restore drill for real against the target hosting setup.
  - Review safe cleanup of remaining internal `stripe_*` compatibility naming.

Primary ownership:

- `apps/printer-agent`
- `apps/api/src/printing`
- `apps/api/src/payments`
- `docs/runbooks`
- `docs/deployment.md`

Definition of done:

- Real printer workflow is validated
- Basic production safeguards are added
- Technical debt is reduced
- Operational runbooks are updated

Why Phase 3 and Phase 4 are mergeable:

- Phase 3 is mostly owner-facing product and reporting work
- Phase 4 is mostly backend, hardware, infra, and operational hardening work
- Overlap is low if reporting endpoint changes are coordinated

## Integration rules for all developers

To keep the four phases mergeable, follow these rules:

- Phase 1 owns the staff POS composer and staff order creation UX
- Phase 2 owns KDS and realtime delivery
- Phase 3 owns owner-web advanced admin flows
- Phase 4 owns printer validation, production hardening, and backend cleanup
- Keep API changes additive whenever possible
- Do not rename existing enums, DTOs, or contracts without agreement
- Do not mix unrelated cleanup into phase branches
- Update this handoff after each phase is completed
- Run `npm run check` before opening or merging any phase branch

## Suggested branch names

- `phase-1/staff-pos-core`
- `phase-2/kds-realtime`
- `phase-3/owner-advanced-management`
- `phase-4/production-hardening-printing`

## Suggested integration branches

- `integration-ops` for Phase 1 + Phase 2
- `integration-admin` for Phase 3 + Phase 4

Suggested order:

1. Merge Phase 1 into `integration-ops`
2. Merge Phase 2 into `integration-ops`
3. Merge Phase 3 into `integration-admin`
4. Merge Phase 4 into `integration-admin`
5. Merge `integration-ops` and `integration-admin`
6. Run full regression and only then merge to `main`

## What was validated locally

- `npm run check`
- `npm run prisma:generate`
- `npm run typecheck`
- `npm run test`
- `npm run build`

The customer-receipt printing change was validated through typecheck, tests,
and build. Physical printer testing was intentionally skipped because printer
hardware is not available yet.

The owner-web implementation was also validated through full repo checks,
typecheck, and production builds.

The staff-web implementation was also validated through full repo checks,
typecheck, and production builds.

The Phase 2 realtime and first KDS block was validated through:

- `npm run typecheck --workspace @restaurant-pos/api`
- `npm run test --workspace @restaurant-pos/api`
- `npm run build --workspace @restaurant-pos/api`
- `npm run typecheck --workspace @restaurant-pos/staff-web`
- `npm run build --workspace @restaurant-pos/staff-web`

The cashier and owner payment-control improvements were validated through:

- `npm run typecheck --workspace @restaurant-pos/staff-web`
- `npm run build --workspace @restaurant-pos/staff-web`
- `npm run build --workspace @restaurant-pos/customer-web`
- `npm run typecheck --workspace @restaurant-pos/owner-web`
- `npm run build --workspace @restaurant-pos/owner-web`
- `npm run build --workspace @restaurant-pos/db`

The first Phase 4 hardening block was validated through:

- `npm run typecheck --workspace @restaurant-pos/api`
- `npm run test --workspace @restaurant-pos/api`
- `npm run build --workspace @restaurant-pos/api`

The second Phase 4 operations block was validated through:

- `npm run typecheck --workspace @restaurant-pos/api`
- `npm run test --workspace @restaurant-pos/api`
- `npm run build --workspace @restaurant-pos/api`

## What was validated in deployed staging

- `GET /api/v1/health` returned `status: ok`.
- Customer QR menu URL loaded successfully in the deployed customer web app.
- A real HitPay sandbox payment completed successfully through the hosted
  checkout flow.
- Paid orders were recorded correctly and visible in the HitPay sandbox
  dashboard.
- The deployed flow now shows HitPay, not Stripe, to the customer.

The new Phase 4 rate-limiting middleware has not been validated on deployed
staging yet in this handoff state.

The new Phase 4 request logging and Swagger toggle have not been validated on
deployed staging yet in this handoff state.

The new Phase 4 error webhook hook has not been validated on deployed staging
yet in this handoff state.

## Required deployment notes

For staging or production, the important API environment variables are:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `PLATFORM_ADMIN_API_KEY`
- `OWNER_APP_BASE_URL`
- `CUSTOMER_APP_BASE_URL`
- `API_TRUST_PROXY`
- `SWAGGER_ENABLED`
- `HITPAY_API_KEY`
- `HITPAY_WEBHOOK_SALT`
- `HITPAY_API_URL`
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
npm run dev:owner
npm run dev:staff
```

Useful checks:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
npm run test
npm run build
```

## Where the next developer should resume

1. Use `docs/runbooks/staging-rollout.md` and
   `docs/runbooks/production-readiness.md` as the operational checklist, plus
   `docs/runbooks/backup-restore-drill.md` for restore rehearsal.
2. Do not block continuation on printer validation.
3. Validate one real Windows printer-agent machine against the target thermal
   printer later, including the new customer-receipt output.
4. Decide whether to do a deeper schema cleanup of legacy internal `stripe_*`
   column names after staging is stable.
5. Continue from the current owner-web and staff-web baselines rather than
   scaffolding from scratch.
6. Next frontend priorities:
   - refine the new KDS mode with station filters, expo handling, and deeper
     kitchen ergonomics
   - decide later whether KDS should stay inside staff-web or split into its
     own dedicated app
7. Note on cashier permissions:
   - newly provisioned cashier roles now include `payment.settings.manage`
   - existing tenants are covered by Prisma migration
     `20260608170000_backfill_cashier_payment_settings_manage`
   - deploy `npm run prisma:deploy` in staging or production before testing the
     cashier-side online-card toggle with older cashier accounts

The payment flow no longer needs rescue work unless HitPay credentials are
rotated or the deployment environment changes.

## Important paths

- API: `apps/api/src`
- Customer web: `apps/customer-web`
- Owner web: `apps/owner-web`
- Staff web: `apps/staff-web`
- Printer agent: `apps/printer-agent/src`
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
- The owner-web menu editor currently uses a fast text-based category/item
  format. Modifier groups and item variants still need richer UI treatment.
- The owner-web tables screen currently favors bulk text setup plus QR rotation
  rather than fine-grained visual editing.
- The staff-web operations board and walk-in POS baseline are live. Remaining
  POS work is now about cashier refinement and advanced settlement flows rather
  than first-time scaffolding.
- Customer-web now points guests to the cashier when online payment is turned
  off instead of showing the older generic staff-help wording.
- Staff POS and owner-web now share the same live `ONLINE_CARD` business
  control, and older cashier roles are backfilled by Prisma migration
  `20260608170000_backfill_cashier_payment_settings_manage`.
- The first KDS screen now exists, but station-level filtering, expo-specific
  flow, and stronger kitchen event modeling are still open.
