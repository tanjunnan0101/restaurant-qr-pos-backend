# Restaurant QR POS Design System

Status: implemented customer ordering foundation, 2026-06-07

## Product Principles

- Put table confidence first. The outlet, zone, table, and service mode must be
  obvious immediately after a QR scan.
- Optimise for one-handed phone use, weak restaurant Wi-Fi, and first-time
  customers with no login or app download.
- Use warm hospitality styling without sacrificing speed, contrast, or price
  legibility.
- Keep payment truth on the backend. Frontend totals are previews and browser
  redirects never imply payment success.

## Core Tokens

| Role           | Value                     |
| -------------- | ------------------------- |
| Paper          | `#F7F0E5`                 |
| Surface        | `#FFFDF9`                 |
| Ink            | `#241A16`                 |
| Muted text     | `#6F625B`                 |
| Border         | `#E4D5C4`                 |
| Paprika action | `#C84D32`                 |
| Deep action    | `#AF3424`                 |
| Sage success   | `#406B58`                 |
| Error          | `#A93226`                 |
| Focus ring     | `rgba(200, 77, 50, 0.28)` |

Use Georgia for display headings and the platform system stack for interface
copy. This avoids a font download on the critical QR path while retaining a
distinct restaurant-menu character.

Spacing follows a `4px` base with primary steps at `8`, `12`, `16`, `20`, `24`,
`32`, and `48px`. Controls must provide at least a `44px` touch target. Cards
use `16-24px` radii; sheets and drawers use `24-28px` top radii.

## Components

- **Location card:** outlet zone and table on the left, service mode badge on
  the right.
- **Category navigation:** sticky horizontal chips with visible active and
  focus states.
- **Product card:** image or resilient placeholder, concise description,
  price, and explicit unavailable state.
- **Item customiser:** bottom sheet on phones, centred dialog on larger
  screens; required choices show inline validation.
- **Cart CTA:** sticky above the phone safe area with item count and final
  preview total.
- **Checkout drawer:** editable items, itemised subtotal/service/GST, payment
  radios, and a persistent final action.
- **Status page:** plain-language processing, success, failure, cancellation,
  delayed PayNow, and manual-verification states.

Use Lucide icons consistently. Do not use emoji as interface icons.

## Interaction And Accessibility

- Preserve visible keyboard focus and semantic controls.
- Announce validation and async failures with alert or live regions.
- Do not hide the final action under a browser safe area or virtual keyboard.
- Respect `prefers-reduced-motion`.
- Avoid layout-shifting hover effects; transitions should be `150-220ms`.
- Maintain a minimum WCAG AA contrast ratio for body text.
- Show loading skeletons, offline status, empty search, sold-out, and API error
  states.

## Responsive Rules

- **Phone, 360-767px:** single-column menu, bottom sheets, sticky cart CTA.
- **Tablet, 768-1023px:** wider cards and dialogs while preserving touch-first
  behaviour.
- **Desktop, 1024px+:** constrained content column and right-side checkout
  drawer; do not stretch menu copy across the viewport.

## Delivery Checklist

- Verify at `375px`, `768px`, `1024px`, and `1440px`.
- Confirm required modifiers cannot be skipped.
- Confirm displayed totals match backend pricing rules.
- Confirm disabled Stripe and PayNow methods disappear after refreshing QR
  context.
- Confirm all payment result states remain understandable without colour.
- Run typecheck, lint, production build, and a browser walkthrough against the
  real API.
