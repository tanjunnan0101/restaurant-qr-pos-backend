# Staff Web Page Notes

Status: baseline implemented, 2026-06-08

## Intent

Staff Web is the outlet operations surface used during service hours. It should
optimise for speed, queue visibility, table awareness, and low-friction status
updates rather than onboarding or deep configuration.

## Routes

- `/login`: company slug, email, and password login for staff users.
- `/dashboard`: outlet-level queue and table pressure summary.
- `/outlets/:outletId/orders`: live order board with status progression.
- `/outlets/:outletId/tables`: zone and table overview with QR visibility.
- `/outlets/:outletId/pos`: reserved continuation route for walk-in order entry.

## UI Rules

- Keep the service board dense but readable; reduce dead space compared with the
  owner console.
- Make the active queue the visual priority over profile or onboarding context.
- Use status pills and action labels that spell out the next move clearly.
- Treat tablet use as a first-class target, not just desktop scaling.
- Keep walk-in POS continuation in the same visual language so the next phase
  can extend the current shell instead of replacing it.
