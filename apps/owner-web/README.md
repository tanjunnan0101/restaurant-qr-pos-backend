# Owner Web Placeholder

This directory reserves the future owner and outlet-admin web application
without affecting the current monorepo checks.

Recommended first scope:

- Owner activation
- Login
- Outlet settings
- Menu management
- Table and QR management
- Payment settings
- Printer setup visibility

Suggested implementation approach:

- Next.js App Router
- Reuse the existing API and JWT auth model
- Ship owner activation and menu/table setup first, then reporting later

Suggested first routes:

- `/activate`
- `/login`
- `/dashboard`
- `/outlets/:outletId/menu`
- `/outlets/:outletId/tables`
- `/outlets/:outletId/payment-settings`
- `/outlets/:outletId/printing`
