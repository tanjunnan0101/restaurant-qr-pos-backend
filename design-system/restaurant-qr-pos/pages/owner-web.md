# Owner Web Page Notes

Status: scaffolded, 2026-06-08

## Intent

Owner Web is the admin surface for onboarding and operating restaurant clients.
It should make the first 10 clients easy to set up from one domain, using
company slug plus owner credentials instead of one app copy per restaurant.

## Routes

- `/activate`: token and password activation scaffold.
- `/login`: company slug, email, and password login scaffold.
- `/dashboard`: onboarding checklist and readiness summary.
- `/outlets/:outletId/menu`: menu categories, draft/publish shell, sold-out path.
- `/outlets/:outletId/tables`: dining zones, table QR state, export/rotate shell.
- `/outlets/:outletId/payment-settings`: online, HitPay card, and PayNow controls.
- `/outlets/:outletId/printing`: Wi-Fi printer and printer-agent readiness.

## UI Rules

- Use the dark ink sidebar on desktop and stacked navigation below 900px.
- Keep all primary actions at least 44px high.
- Prefer short operational labels over customer-facing hospitality language.
- Use status pills with text labels so state does not rely on color alone.
- Avoid deployment-specific language until the web app hosting plan is chosen.
