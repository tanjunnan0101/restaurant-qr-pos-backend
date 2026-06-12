# Staff Terminal Live Readiness

Status date: 2026-06-12

Target surface:

- `apps/staff-web`
- live host: `https://staff.sakorio.com`

Use this checklist after the next deploy of the staff terminal and before
calling the outlet operations surface ready for a real floor trial.

Legend:

- `Ready`: implemented and verified in current code or latest staging checks
- `Verify live`: expected to work, but still needs manual browser validation
- `Blocked`: cannot be signed off yet because staging data, credentials, or
  hardware are not in a trustworthy state
- `Not ready`: known product or UX gap remains

## 1. Shell And Navigation

| Check | Status | Notes |
| --- | --- | --- |
| Staff login page loads correctly | `Verify live` | Route exists and builds cleanly. Confirm fresh-browser access after deploy. |
| Outlet shell loads after login | `Verify live` | Requires valid active staff credentials in staging. |
| Workspace navigation is consistent across sidebar and outlet header | `Verify live` | `Menus` and `Attendance` were aligned in the shell, but still needs a final usability judgment live. |
| Surface naming is understandable to floor staff | `Not ready` | Overall better, but still wants one final terminology cleanup pass after live walkthrough. |

## 2. Tables / Floor Operations

| Check | Status | Notes |
| --- | --- | --- |
| Floor board loads without demo-only setup controls in normal live mode | `Ready` | Demo-room actions are now gated behind `NEXT_PUBLIC_ENABLE_STAGING_TOOLS=true`. |
| Tables render as a room-first board rather than a narrow dashboard | `Ready` | Full-width floor board plus docked selected-table inspector implemented. |
| Operator can tap a table and immediately reach POS | `Verify live` | Flow is wired in code; validate end to end from `Tables -> Open POS`. |
| Operator can jump from table to order queue | `Verify live` | `View table orders` and `Open latest ticket` links are present. |
| Table state changes are easy to trigger | `Verify live` | `Seat table` / `Clear table` actions are wired; confirm real operator speed. |
| Guest help resolution is visible and obvious | `Verify live` | Help card and `Help delivered` action are present; validate with a live service request. |
| QR rotation is available only to authorized staff | `Verify live` | Permission-gated in UI; confirm with staging roles. |
| Full-floor readability holds on common shop viewport | `Not ready` | Needs final live screen-size check on the actual tablet / terminal layout. |

## 3. Orders / Cashier Queue

| Check | Status | Notes |
| --- | --- | --- |
| Orders default to the actionable queue | `Ready` | `ACTIONABLE` filter is now the default unless table-focused. |
| Queue cards surface table code, payment state, and next action quickly | `Ready` | Card density and field priority were improved in the latest pass. |
| Cashier can select a ticket and understand the next service step immediately | `Verify live` | Summary strip and selected-ticket header were tightened; validate with real tickets. |
| Cashier can jump into POS edit flow without hunting | `Ready` | `Edit in POS` now appears in the selected-ticket header when allowed. |
| Payment recovery actions are understandable | `Verify live` | Checkout recreation and manual verification are wired; validate with staging orders. |
| Void flow is clear and safe | `Verify live` | Void remains gated to early statuses; validate actual operator comprehension. |
| Queue still scans well with many tickets | `Not ready` | Requires a denser live-volume test, not just code review. |

## 4. KDS / Kitchen

| Check | Status | Notes |
| --- | --- | --- |
| Lane ordering prioritizes newest actionable kitchen work first | `Ready` | Sorting now prioritizes `SENT_TO_KITCHEN`, then `PREPARING`, then `READY`. |
| Lane cards show table code, age, and next action clearly | `Ready` | Implemented in the latest pass. |
| Selected ticket panel makes the next kitchen action obvious | `Ready` | `Next ...` cue and compressed summary strip now surface the next step. |
| Kitchen can open the underlying order detail if needed | `Verify live` | Deep link exists; validate end to end after deploy. |
| KDS remains readable under higher ticket counts | `Not ready` | Needs high-volume browser validation with many live tickets. |

## 5. Attendance

| Check | Status | Notes |
| --- | --- | --- |
| Shared-iPad attendance flow is understandable | `Partial` | Much better than earlier QA, but still needs a final real-user runthrough. |
| Employee can select self from roster | `Ready` | Kiosk model is implemented. |
| Photo capture uses front camera on iPad | `Ready` | File input uses `accept=\"image/*\"` and `capture=\"user\"`. |
| Photo policy follows outlet settings | `Ready` | Enforcement no longer blocks optional-photo outlets unnecessarily. |
| Fallback manual clocking is clearly separated | `Ready` | Hidden inside fallback section rather than mixed into the main action. |
| Shift planner is usable by managers | `Verify live` | Planner exists, but still needs a real workflow pass in browser. |

## 6. Menus

| Check | Status | Notes |
| --- | --- | --- |
| Create menu action is clearly visible | `Ready` | Present in the menu workspace. |
| Add item action is clearly visible | `Ready` | Quick-add draft flow is present and no longer hidden. |
| Draft / publish workflow is understandable | `Verify live` | Implemented, but needs a real staff walkthrough after deploy. |

## 7. Auth, Roles, And Staging Data

| Check | Status | Notes |
| --- | --- | --- |
| Owner can still log in | `Verify live` | Previously verified, but should be rechecked after next deploy. |
| Staff can log in with a known active cashier account | `Blocked` | Staging account state is inconsistent. One cashier is pending activation and one active cashier no longer accepts the default password. |
| Outlet role permissions behave correctly in UI | `Verify live` | Permission gating exists, but live role validation is still needed. |

## 8. Required Live Walkthrough Before Sign-Off

Run these in browser after the next deploy:

1. Sign in as a cashier on `staff.sakorio.com`.
2. Open `Tables` and confirm the room board fills the page cleanly.
3. Tap a table and confirm `Open POS` works immediately.
4. Open `Orders` and confirm the default queue is action-focused.
5. Select a pending or in-service ticket and confirm the next action is obvious.
6. Edit a POS-eligible ticket from the selected-ticket header.
7. Open `KDS` and confirm lane cards scan cleanly without text collisions.
8. Advance one kitchen ticket through the next stage.
9. Open `Attendance` and confirm self-select plus photo capture work on tablet.
10. Open `Menus` and confirm create / add-item actions are easy to find.

## 9. Release Gate Summary

Current call:

- `Tables`: close to live trial readiness, pending browser validation
- `Orders`: close to live trial readiness, pending cashier-speed validation
- `KDS`: improved substantially, but still needs a high-volume live pass
- `Attendance`: workable, but still needs one tablet-native real-user check
- `Menus`: operationally usable
- `Overall staff terminal`: not yet final-production-ready, but now realistic for
  the next guided staging walkthrough

Do not call `staff.sakorio.com` fully production-ready until all of the
following are true:

- a known active cashier account can log in reliably
- the `Tables -> POS -> Orders -> KDS` walkthrough succeeds without friction
- at least one tablet-sized live pass is completed
- at least one moderate-volume kitchen and queue simulation is completed
