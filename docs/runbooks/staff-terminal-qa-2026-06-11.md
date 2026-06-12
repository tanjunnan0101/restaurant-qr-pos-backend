# Staff Terminal QA Review

Status date: 2026-06-12

Owner: Product / UX / frontend QA handoff

Target surface:

- `apps/staff-web`
- live URL: `https://staff.sakorio.com`

Related reference:

- UX redesign brief: `docs/design/staff-sakorio-ui-ux-redesign-brief.md`

## 1. Scope

This document reviews whether `staff.sakorio.com` behaves like a usable
restaurant floor terminal, not just whether the backend endpoints respond.

The QA covers:

- cashier order entry
- table and floor operation
- kitchen pipeline visibility
- attendance / clock-in flow
- menu control usability
- navigation consistency
- overall terminal readiness for a live shop

This review was based on:

- direct live simulation against the deployed Sakorio staging stack
- visual inspection of the current `staff.sakorio.com` UI
- code inspection of `apps/staff-web`
- the already-working cross-surface flows:
  - owner can log in
  - staff can log in
  - QR menu opens
  - customer can place and pay for an order
  - staff can see resulting orders
  - owner dashboard remains functional

## 2. Executive Summary

The system is functionally alive, but the staff terminal is not yet shop-ready.

The core platform works end to end:

- orders can be created
- payments can settle
- QR orders appear in staff views
- owners and staff can authenticate

The problem is the operating surface. The current staff UI still behaves more
like an internal admin prototype than a fast, compact restaurant workstation.

### Verdict

- Backend readiness: `8/10`
- Staff terminal operational readiness: `5.5/10`
- Safe for staging demos: `Yes`
- Safe for live floor use without more UX cleanup: `No`

## 2.1 Implementation Cross-Check Status

This section cross-checks the original QA findings against the current codebase
and latest live verification as of `2026-06-12`.

Legend:

- `Fixed`: implemented and verified in code or live behavior
- `Partial`: materially improved, but still not at production-ready quality
- `Open`: still needs development or product cleanup
- `Blocked`: implementation exists, but final verification is blocked by data,
  credentials, or deployment state

| QA area | Current status | Cross-check |
| --- | --- | --- |
| Attendance policy enforcement | `Fixed` | Photo proof now follows outlet policy instead of always blocking clock-in. |
| Shared iPad attendance flow | `Partial` | Kiosk flow is much better, with main clock action, fallback, and planner separation, but still needs one more real-user verification pass. |
| Navigation consistency | `Partial` | The outlet shell now exposes `Menus` and `Attendance` consistently and active-workspace routing is more aligned, but the staff IA still wants one more simplification pass. |
| Payment naming after HitPay migration | `Partial` | Staff POS mostly shows the correct methods, but stale Stripe-era type names still exist in shared staff-web typing. |
| Demo room actions in live tables UI | `Fixed` | Demo-floor controls are now gated behind `NEXT_PUBLIC_ENABLE_STAGING_TOOLS`, so normal live staff users no longer see seeding actions by default. |
| Orders board action density | `Partial` | Orders now default to an actionable queue, use denser cards, and surface edit / next-step actions earlier, but the service lane still wants one final live cashier-speed refinement pass. |
| Tables as a true floor-first surface | `Partial` | The table board is now room-first with a full-width floor map and a docked action panel, but it still needs live operator validation before it can be called fully production-ready. |
| Kitchen board scanability | `Partial` | Kitchen cards are denser, queue ordering now prioritizes newly released tickets first, and selected-ticket next actions are clearer, but the lane view still needs one final high-volume live pass. |
| Menu add/edit discoverability | `Fixed` | Create menu and quick-add item actions are now clearly exposed in the menus workspace. |
| Staff roster API stability | `Fixed` | Live `GET /admin/outlets/:outletId/staff` crash has been fixed and redeployed. |
| Staff terminal live login verification | `Blocked` | Staff account state is inconsistent in staging: one cashier is pending activation, one active cashier no longer accepts the default password. |

### Cross-check notes

- Owner auth works live.
- Staff roster endpoint works live again.
- Attendance received the strongest improvement since the first QA run.
- Menus is more usable than before and no longer hides create/add-item entry
  points.
- Tables no longer expose demo-only room seeding controls in the default live
  staff workflow.
- Tables now use a full-width floor board with the selected table docked below,
  which is materially closer to a real floor console.
- Orders now surface table code, payment state, next action, and POS edit entry
  faster from the main queue and selected-ticket header.
- Kitchen now surfaces table code, age, and next action more clearly from each
  lane card and the selected ticket panel.
- Orders and Kitchen both received denser, action-first passes, but neither
  should yet be considered fully finished UX.
- The biggest remaining gaps are not platform failures. They are operator UX
  and service-speed issues.

## 3. Answers To The Main Questions

### 3.1 How user friendly is it?

Score: `6/10`

The terminal exposes a lot of capability, but too much of it is still presented
as large text blocks, oversized cards, or admin-style forms. A cashier or floor
runner should be able to recognize the next action almost instantly. That is
not consistently true yet.

Updated cross-check:

- clearly better than the original 2026-06-11 snapshot
- still not yet intuitive enough for true shop-floor confidence without one
  more live pass

### 3.2 Is it easy to navigate?

Score: `6/10`

Navigation is understandable after exploration, but not immediately intuitive.
There are still mismatches between top-level route exposure and page-level
expectations, especially around `Menus` and `Attendance`.

Updated cross-check:

- improved, especially across the outlet shell and workspace routing
- still wants one cleaner, single mental model across all staff routes

### 3.3 Are there inconsistencies?

Score: `Yes, materially`

The current system still has inconsistencies across:

- payment naming and payment method exposure
- attendance policy vs actual form validation
- navigation between header links and sidebar links
- language around demo setup versus real floor operation

Updated cross-check:

- attendance policy inconsistency has been fixed
- payment naming, navigation, and demo/live separation are still inconsistent

### 3.4 Is the flow smooth?

Score: `6/10`

The best flow currently is:

- QR order placed
- order reaches staff
- order can be viewed and actioned

The weakest flows are:

- attendance clock-in
- scanning and acting on many tickets quickly
- understanding tables at room scale
- adding or managing menu content from the staff surface

Updated cross-check:

- attendance is no longer one of the weakest flows at the same severity
- Orders, Tables, and Kitchen are materially improved, but still need one live
  polish wave

### 3.5 As a cashier, is keying orders in POS easy?

Score: `6/10`

The POS is closer to usable than the other surfaces because item selection,
ticket editing, and payment actions exist. But the interface still needs tighter
density, better cart hierarchy, and more compact decision making so staff do
not have to visually travel too far.

Updated cross-check:

- still true
- POS works, but it is not yet above-the-fold efficient enough on common
  working viewports

### 3.6 Can tables be viewed and orders edited from the ground?

Score: `Partial`

There is now a stronger whole-floor direction, but the floor still does not yet
feel like a true restaurant map. The table board is not yet the default mental
model for floor staff. It still reads partly like a filterable dashboard.

Updated cross-check:

- still true in principle, but much improved
- the floor board now behaves more like a room console than a filter dashboard
- final confidence should come from one live service simulation pass

### 3.7 Is the kitchen pipeline polished?

Score: `7/10`

The underlying lane model exists, but the visual treatment still becomes clunky
under real ticket volume. The page needs denser cards, stronger priority
grouping, and less copy so the kitchen can scan instead of read.

Updated cross-check:

- still true in principle, but materially improved
- KDS is now faster to scan, but still needs one high-volume validation pass

## 4. What Already Works

These flows are functionally present today:

- owner sign-in works
- staff sign-in works
- QR ordering works
- HitPay checkout works
- paid orders can be seen by staff
- owner dashboard remains available
- staff terminal routes exist for POS, Orders, Tables, KDS, Menus, Inventory,
  Attendance, Printing, and Team

This is important because the project does not need a platform restart. It
needs focused terminal product polish.

Additional live verification completed after the original QA run:

- owner login still works on the deployed Sakorio stack
- staff roster API now works live again after the backend fix
- the live roster currently shows:
  - `owner@example.com` as `ACTIVE`
  - `cashier@example.com` as `PENDING_ACTIVATION`
  - `cashier1@example.com` as `ACTIVE`

Important note:

- final staff-side live verification is currently blocked by account state, not
  by a known frontend terminal crash

## 5. Highest-Priority Findings

Findings are ordered by practical severity for live operations.

### 5.1 Attendance contradicts outlet policy and blocks intuitive use

Severity: `High`

Current status: `Fixed`

Observed issue:

- the outlet can report that photo proof is not required
- the attendance form still blocks the action unless a photo is attached
- this creates unnecessary friction and directly confuses frontline staff

Code references:

- `apps/staff-web/components/outlet-attendance-page.tsx:145`
- `apps/staff-web/components/outlet-attendance-page.tsx:200`
- `apps/staff-web/components/outlet-attendance-page.tsx:204`
- `apps/staff-web/components/outlet-attendance-page.tsx:659`

Impact:

- staff cannot trust the attendance screen
- iPad shift start feels broken
- onboarding a new outlet becomes harder

Required fix:

- bind photo enforcement to actual outlet policy
- if photo is required, make capture obvious and fast
- if photo is optional, allow immediate clock-in without blocking

Cross-check result:

- implemented in `apps/staff-web/components/outlet-attendance-page.tsx`
- `photoRequired` is now read from outlet settings
- clock actions only block when `photoRequired` is true
- the page has also been reworked into a more kiosk-first structure with:
  - clear clock action placement
  - collapsed fallback flow
  - secondary manager planner

Residual improvement:

- still verify the flow one more time with a working live cashier credential
- continue reducing vertical space so the shared station behaves even better on
  smaller tablets and laptops

### 5.2 Navigation is inconsistent across page systems

Severity: `High`

Current status: `Open`

Observed issue:

- page-level outlet navigation exposes `Menus`
- the sidebar primary flow does not expose the same information architecture
- `Attendance` exists as a real route label but is not given equal navigation
  treatment

Code references:

- `apps/staff-web/components/outlet-page-base.tsx:11`
- `apps/staff-web/components/outlet-page-base.tsx:16`
- `apps/staff-web/components/staff-page-frame.tsx:20`
- `apps/staff-web/components/staff-page-frame.tsx:29`
- `apps/staff-web/components/staff-page-frame.tsx:43`
- `apps/staff-web/components/staff-page-frame.tsx:175`

Impact:

- staff have to learn two navigation models
- some capabilities feel hidden or secondary when they are operationally core

Required fix:

- collapse the terminal into one consistent navigation system
- define a clear primary rail:
  - POS
  - Orders
  - Tables
  - Kitchen
- define a clear secondary rail:
  - Menus
  - Inventory
  - Attendance
  - Team
  - Printing

Cross-check result:

- the sidebar is closer to the intended primary/secondary split
- but the outlet header still treats `Menus` as primary workspace chrome
- `Attendance` is not surfaced with equal visibility across all navigation
  layers

Residual improvement:

- make the route model and the visible navigation model identical
- reduce duplicate navigation thinking between top command strip and left rail

### 5.3 Payment terminology still leaks old Stripe naming and inconsistent models

Severity: `High`

Current status: `Partial`

Observed issue:

- live configurations have previously exposed `STRIPE_PAYNOW`
- the staff type model only accepts `ONLINE_CARD`, `MANUAL_PAYNOW`, and `CASH`
- the POS fallback maps unknown methods back to `ONLINE_CARD`

Code references:

- `apps/staff-web/lib/types.ts:9`
- `apps/staff-web/lib/types.ts:189`
- `apps/staff-web/components/outlet-pos-page.tsx:117`
- `apps/staff-web/components/outlet-pos-page.tsx:2443`

Impact:

- payment language is harder to trust
- UI can misrepresent what method is actually active
- legacy naming can reappear in staff understanding even after HitPay migration

Required fix:

- align backend-configured methods and staff-web type model
- remove stale Stripe-era naming from all staff-visible language
- make the cashier only see the actual outlet-supported methods

Cross-check result:

- cashier POS flow now uses HitPay-facing language in the main checkout surface
- supported cashier methods are mostly constrained to:
  - `ONLINE_CARD`
  - `MANUAL_PAYNOW`
  - `CASH`
- however, `apps/staff-web/lib/types.ts` still contains stale Stripe-era scope
  names in `PaymentScope`

Residual improvement:

- remove obsolete Stripe scope names from the staff-web type layer
- verify no fallback or legacy labels can reappear in edge UI states

### 5.4 Demo floor setup is still visible in a live operating surface

Severity: `Medium-High`

Current status: `Open`

Observed issue:

- the tables page still exposes demo/sample floor setup actions in the terminal
- these actions are useful for staging, but not appropriate as a normal shop
  control

Code references:

- `apps/staff-web/components/outlet-tables-page.tsx:539`
- `apps/staff-web/components/outlet-tables-page.tsx:551`
- `apps/staff-web/components/outlet-tables-page.tsx:665`

Impact:

- staff can mistake scaffolding actions for production workflow
- the tables view feels less trustworthy and less polished

Required fix:

- move demo setup behind a staging-only admin toggle
- keep production table screens focused on service actions only

Cross-check result:

- the tables workspace still exposes:
  - `Build demo room (10 tables)`
  - `Finish demo room`
  - `Refresh demo room`
  - `Load missing tables now`
- this remains visible in the normal operator path

Residual improvement:

- gate demo-room setup behind a staging/admin flag
- remove staging utilities from normal staff service UI

### 5.5 Orders default too broad for live service scanning

Severity: `Medium`

Current status: `Open`

Observed issue:

- the orders screen initializes with `ALL` statuses
- this increases noise for a live service operator

Code reference:

- `apps/staff-web/components/outlet-orders-page.tsx:66`

Impact:

- action-needed tickets are diluted by resolved or low-priority tickets
- staff have to filter before they can work

Required fix:

- default to actionable states first
- recommended default set:
  - `PENDING_PAYMENT`
  - `PAYMENT_PROCESSING`
  - `SENT_TO_KITCHEN`
  - `PREPARING`
  - `READY`

Cross-check result:

- the orders route still initializes the status filter with `ALL`
- queue mode now helps prioritize action states, but the status default itself
  remains too broad

Residual improvement:

- change the default status filter to actionable service states
- keep resolved and archival states one step away from the first operator view

## 6. Live Simulation Snapshot

This review used the current staging tenant and current live data shape.

Observed live context during QA:

- `1` outlet
- `1` zone
- `1` real table
- `17` orders visible
- action-heavy mix across:
  - `PENDING_PAYMENT`
  - `PAYMENT_PROCESSING`
  - `SENT_TO_KITCHEN`
- owner dashboard functioning
- QR ordering functioning
- attendance records effectively unused in real flow

Additional verification after the original QA run:

- live owner login still works
- live staff roster endpoint was repaired and redeployed
- live staff roster currently shows:
  - `owner@example.com` as `ACTIVE`
  - `cashier@example.com` as `PENDING_ACTIVATION`
  - `cashier1@example.com` as `ACTIVE`
- final staff login verification is currently blocked by credential state, not
  by the staff terminal frontend itself

Important QA interpretation:

The live dataset is still small. Some layout problems already show up even with
low floor complexity. That means the current UI would degrade further under a
real dinner rush.

## 7. Simulation Use Cases

These are the first 15 practical use cases executed against the current build.

### 7.1 Staff logs in

Result: `Pass`

Notes:

- login works
- session lands inside staff terminal

Improvement:

- add clearer role and outlet selection confirmation on entry

Current status note:

- logic and session path exist
- live cashier verification is currently blocked by account credentials

### 7.2 Staff lands on the main dashboard

Result: `Partial`

Notes:

- information is present
- page still reads more like a metrics board than an operating console

Improvement:

- compress supporting metrics
- elevate next actions

Current status note:

- still valid

### 7.3 Staff switches between primary work areas

Result: `Partial`

Notes:

- possible, but mental model is not yet tight
- route grouping is still inconsistent

Improvement:

- unify navigation and shrink decision load

Current status note:

- still valid

### 7.4 Cashier opens POS and starts a walk-in order

Result: `Pass`

Notes:

- possible today
- structure exists for item selection and ticket creation

Improvement:

- keep category, item list, and cart all above the fold on common screen sizes

Current status note:

- still valid

### 7.5 Cashier searches for menu items

Result: `Partial`

Notes:

- search exists, but menu maintenance and selling flow still feel too separate

Improvement:

- make item discovery denser
- expose add/edit menu actions more clearly

Current status note:

- add/edit visibility has improved materially
- item discovery density still needs more work

### 7.6 Cashier adds an item with modifiers

Result: `Pass`

Notes:

- modifier logic works

Improvement:

- tighten the modifier and ticket layout for faster touch operation

Current status note:

- still valid

### 7.7 Cashier edits quantity and removes items

Result: `Pass`

Notes:

- core editing exists

Improvement:

- make quantity controls more compact and more visually grouped

Current status note:

- still valid

### 7.8 Cashier checks out with online payment

Result: `Pass`

Notes:

- payment flow works
- already validated against HitPay sandbox earlier in staging work

Improvement:

- align language and supported method display fully with live configuration

Current status note:

- provider behavior works
- naming cleanup is not fully finished

### 7.9 Cashier checks out with cash

Result: `Pass / Partial`

Notes:

- cash path exists
- totals and tendering can still feel visually bulky

Improvement:

- make payment summary more glanceable

Current status note:

- still valid

### 7.10 Staff opens the live orders queue

Result: `Partial`

Notes:

- queue is technically useful
- scanning is slower than it should be because cards are still oversized and
  verbose

Improvement:

- denser queue cards
- stronger action grouping

Current status note:

- still valid
- functionally usable
- still needs another density pass before it feels production-fast

### 7.11 Staff resumes a customer-originated order from QR

Result: `Partial`

Notes:

- order visibility exists
- order handoff is present
- the UX still makes the staff read too much before acting

Improvement:

- design around "next best action" rather than record inspection

Current status note:

- still valid
- QR-to-staff handoff works, but action framing still needs to be faster

### 7.12 Staff uses the tables view to understand the room

Result: `Partial`

Notes:

- there is progress toward a floor board
- still not yet comparable to a true table map used in production POS systems

Improvement:

- make tables page the widest, most visual room surface
- remove non-essential copy

Current status note:

- partially improved
- still not yet a true floor-software experience

### 7.13 Staff moves from a table into POS or order follow-up

Result: `Partial`

Notes:

- table detail actions exist
- cross-linking still needs more confidence and less clutter

Improvement:

- make every table tile expose:
  - open order
  - open POS
  - seating state
  - guest help state
  - QR state

Current status note:

- directionally improved
- still needs stronger action hierarchy and less surrounding control chrome

### 7.14 Kitchen reviews the ticket pipeline

Result: `Partial`

Notes:

- lane structure exists
- text density and card sizing still reduce fast readability

Improvement:

- convert kitchen into tighter columns with compact action cards

Current status note:

- still valid
- kitchen needs another compactness/scannability pass

### 7.15 Staff uses attendance from a shared iPad

Result: `Partial / Fail`

Notes:

- concept is directionally correct
- current behavior still confuses policy, staff selection, and proof handling

Improvement:

- build attendance around:
  - who is clocking in
  - what shift they are joining
  - whether photo is required
  - immediate confirmation state

Current status note:

- upgraded to `Partial / Pass`
- the page now follows the intended product model much more closely
- remaining work is final operator polish and live credential-based verification

## 8. Page-By-Page UX Assessment

### 8.1 POS

Current state:

- closest to usable
- still needs denser layout and stronger ticket prominence

What is good:

- order editing exists
- payment exists
- dine-in and walk-in structures exist

What still hurts:

- visual hierarchy can still feel oversized
- ticket and selling surfaces need more balance on medium screens

Current cross-check:

- still true
- POS works, but it is not yet consistently above-the-fold efficient on common
  working viewports

### 8.2 Orders

Current state:

- functional but clunky

What is good:

- service action concepts exist
- detail view exists

What still hurts:

- oversized cards
- too much text for rapid service scanning
- default filter not optimized for action

Current cross-check:

- still true
- logic is present, but visual density and next-action emphasis remain weak

### 8.3 Tables

Current state:

- improved direction, not yet true floor software

What is good:

- whole-floor intent is now visible
- table detail actions exist

What still hurts:

- room map is not yet dominant enough
- too much control chrome around the floor
- demo-floor actions still leak into the screen

Current cross-check:

- still true
- room-first intent exists, but staging utilities and control density still get
  in the way

### 8.4 Kitchen

Current state:

- conceptually sound, visually noisy

What is good:

- ticket lanes exist
- order state progression is represented

What still hurts:

- card content still overflows the available scanning budget
- the kitchen should read like a board, not like stacked report tiles

Current cross-check:

- still true
- lanes are there, but they need more compression and stronger urgency ranking

### 8.5 Menus

Current state:

- read/control surface exists
- creation and editing affordances are still not obvious enough

What is good:

- outlet menu context is visible

What still hurts:

- staff cannot naturally understand where to add menu items
- menu management still feels too back-office for a live service terminal

Current cross-check:

- improved materially
- create/add-item affordances are now obvious
- page still has room to become more service-dense, but this is no longer one
  of the most confusing surfaces

### 8.6 Attendance

Current state:

- most confusing page in the terminal

What is good:

- the right product idea is present:
  - shared device
  - select employee
  - prove start/end state

What still hurts:

- policy mismatch
- error-prone interaction
- weak shift mental model

Current cross-check:

- no longer true at the same severity
- attendance has improved substantially and is now more coherent than the
  original QA baseline
- it should still be treated as a high-touch surface that needs one more live
  operator pass

## 9. Priority Remediation Plan

### P0: Must fix before claiming shop-floor readiness

- fix attendance policy behavior
- remove or hide demo-floor actions from normal staff flow
- unify navigation model
- clean payment method naming and supported method logic
- compress Orders and KDS into genuinely scannable boards

Updated state:

- attendance policy behavior: `Done`
- demo-floor actions: `Open`
- navigation model: `Open`
- payment naming cleanup: `Partial`
- Orders and KDS compactness: `Open`

### P1: Next wave of usability upgrades

- turn Tables into a true room-first floor map
- make POS denser and more touch-efficient
- expose menu add/edit clearly from the Menus workspace
- default orders to actionable filters

Updated state:

- Tables room-first model: `Partial`
- POS density: `Open`
- menu add/edit discoverability: `Done`
- actionable orders defaults: `Open`

### P2: After the terminal becomes stable

- add stronger empty states and error recovery
- tune role-based entry states
- add real printer-state overlays once hardware is available

Updated state:

- still valid

## 10. Recommended Acceptance Criteria For The Next Developer

The next pass should not be considered done until all of these are true:

1. A cashier can open POS, add items, take payment, and send the order in under
   20 seconds without scrolling on a common laptop viewport.
2. A floor runner can understand all active tables from the Tables page without
   reading long paragraphs.
3. A kitchen operator can scan the highest-priority ticket in under 2 seconds.
4. Attendance only requires a photo when outlet policy says it must.
5. Menu management makes it obvious where to add or edit a menu item.
6. Demo setup controls are no longer mixed into normal live operations.
7. Payment labels shown to staff match the actual provider and enabled methods.

Cross-check status:

1. `Open`
2. `Open`
3. `Open`
4. `Done`
5. `Partial`
6. `Open`
7. `Partial`

## 11. Final Verdict

Sakorio has crossed the hard technical threshold: the platform works.

What remains is the harder product threshold: the staff terminal must become a
fast operating instrument for real people during service.

That means the next phase should focus less on adding raw capability and more
on:

- speed
- clarity
- density
- confidence
- action-first design

Until that pass is finished, `staff.sakorio.com` should be treated as a strong
staging terminal, not a final production floor terminal.
