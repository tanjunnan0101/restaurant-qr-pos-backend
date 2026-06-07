# Staff Web Placeholder

This directory reserves the future staff-facing web application without adding
it to the current build pipeline yet.

Recommended first scope:

- Staff login
- Outlet switcher
- Live order board
- Order status transitions
- Table overview
- Basic POS order entry for walk-in orders

Suggested implementation approach:

- Next.js App Router
- Reuse the existing API and JWT auth model
- Start with a read-only operations board before full POS flows

Suggested first routes:

- `/login`
- `/outlets`
- `/orders`
- `/orders/:orderId`
- `/tables`
- `/pos`
