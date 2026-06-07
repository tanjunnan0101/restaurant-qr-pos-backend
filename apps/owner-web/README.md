# Owner Web

Owner and outlet-admin web application for restaurant client onboarding and
setup. This app is scaffolded as a Next.js App Router workspace and is now part
of the monorepo typecheck/build/lint path.

## Current Scope

- `/activate` owner invitation token flow scaffold
- `/login` client login scaffold using `companySlug`, email, and password
- `/dashboard` repeatable onboarding checklist for roughly 10 clients
- `/outlets/:outletId/menu` menu setup and publish workflow shell
- `/outlets/:outletId/tables` table and QR setup shell
- `/outlets/:outletId/payment-settings` HitPay card and PayNow disable controls
- `/outlets/:outletId/printing` Wi-Fi printer and printer-agent visibility

## Client Model

Use one owner-web app for all restaurant clients. Each client should sign in
with their company slug, owner email, and password. The backend already supports
this shape through `POST /auth/login`.

## Backend Routes To Wire Next

- `POST /auth/activate`
- `POST /auth/login`
- `GET /admin/outlets`
- `GET /admin/outlets/:outletId/menus`
- `POST /admin/outlets/:outletId/menus/setup`
- `GET /admin/outlets/:outletId/tables`
- `POST /admin/outlets/:outletId/tables/setup`
- `GET /admin/outlets/:outletId/payment-settings`
- `POST /admin/outlets/:outletId/payment-settings/disable`
- `POST /admin/outlets/:outletId/payment-settings/enable`
- `GET /admin/outlets/:outletId/printing`
- `POST /admin/outlets/:outletId/printing/setup`
- `POST /admin/outlets/:outletId/printing/printers/:printerId/test`

## Local Development

```bash
npm run dev:owner
```
