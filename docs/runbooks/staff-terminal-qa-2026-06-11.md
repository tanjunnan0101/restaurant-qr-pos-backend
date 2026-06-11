# Staff Terminal QA Review

Status date: 2026-06-11

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

## 3. Answers To The Main Questions

### 3.1 How user friendly is it?

Score: `5/10`

The terminal exposes a lot of capability, but too much of it is still presented
as large text blocks, oversized cards, or admin-style forms. A cashier or floor
runner should be able to recognize the next action almost instantly. That is
not consistently true yet.

### 3.2 Is it easy to navigate?

Score: `5/10`

Navigation is understandable after exploration, but not immediately intuitive.
There are still mismatches between top-level route exposure and page-level
expectations, especially around `Menus` and `Attendance`.

### 3.3 Are there inconsistencies?

Score: `Yes, materially`

The current system still has inconsistencies across:

- payment naming and payment method exposure
- attendance policy vs actual form validation
- navigation between header links and sidebar links
- language around demo setup versus real floor operation

### 3.4 Is the flow smooth?

Score: `5/10`

The best flow currently is:

- QR order placed
- order reaches staff
- order can be viewed and actioned

The weakest flows are:

- attendance clock-in
- scanning and acting on many tickets quickly
- understanding tables at room scale
- adding or managing menu content from the staff surface

### 3.5 As a cashier, is keying orders in POS easy?

Score: `6/10`

The POS is closer to usable than the other surfaces because item selection,
ticket editing, and payment actions exist. But the interface still needs tighter
density, better cart hierarchy, and more compact decision making so staff do
not have to visually travel too far.

### 3.6 Can tables be viewed and orders edited from the ground?

Score: `Partial`

There is now a stronger whole-floor direction, but the floor still does not yet
feel like a true restaurant map. The table board is not yet the default mental
model for floor staff. It still reads partly like a filterable dashboard.

### 3.7 Is the kitchen pipeline polished?

Score: `6/10`

The underlying lane model exists, but the visual treatment still becomes clunky
under real ticket volume. The page needs denser cards, stronger priority
grouping, and less copy so the kitchen can scan instead of read.

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

## 5. Highest-Priority Findings

Findings are ordered by practical severity for live operations.

### 5.1 Attendance contradicts outlet policy and blocks intuitive use

Severity: `High`

Observed issue:

- the outlet can report that photo proof is not required
- the attendance form still blocks the action unless a photo is attached
- this creates unnecessary friction and directly confuses frontline staff

Code references:

- `apps/staff-web/components/outlet-attendance-page.tsx:22`
- `apps/staff-web/components/outlet-attendance-page.tsx:202`
- `apps/staff-web/components/outlet-attendance-page.tsx:869`
- `apps/staff-web/components/outlet-attendance-page.tsx:878`

Impact:

- staff cannot trust the attendance screen
- iPad shift start feels broken
- onboarding a new outlet becomes harder

Required fix:

- bind photo enforcement to actual outlet policy
- if photo is required, make capture obvious and fast
- if photo is optional, allow immediate clock-in without blocking

### 5.2 Navigation is inconsistent across page systems

Severity: `High`

Observed issue:

- page-level outlet navigation exposes `Menus`
- the sidebar primary flow does not expose the same information architecture
- `Attendance` exists as a real route label but is not given equal navigation
  treatment

Code references:

- `apps/staff-web/components/outlet-page-base.tsx:13`
- `apps/staff-web/components/outlet-page-base.tsx:16`
- `apps/staff-web/components/staff-page-frame.tsx:29`
- `apps/staff-web/components/staff-page-frame.tsx:54`
- `apps/staff-web/components/staff-page-frame.tsx:357`
- `apps/staff-web/components/staff-page-frame.tsx:363`

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

### 5.3 Payment terminology still leaks old Stripe naming and inconsistent models

Severity: `High`

Observed issue:

- live configurations have previously exposed `STRIPE_PAYNOW`
- the staff type model only accepts `ONLINE_CARD`, `MANUAL_PAYNOW`, and `CASH`
- the POS fallback maps unknown methods back to `ONLINE_CARD`

Code references:

- `apps/staff-web/lib/types.ts:12`
- `apps/staff-web/lib/types.ts:243`
- `apps/staff-web/components/outlet-pos-page.tsx:2361`
- `apps/staff-web/components/outlet-pos-page.tsx:2390`

Impact:

- payment language is harder to trust
- UI can misrepresent what method is actually active
- legacy naming can reappear in staff understanding even after HitPay migration

Required fix:

- align backend-configured methods and staff-web type model
- remove stale Stripe-era naming from all staff-visible language
- make the cashier only see the actual outlet-supported methods

### 5.4 Demo floor setup is still visible in a live operating surface

Severity: `Medium-High`

Observed issue:

- the tables page still exposes demo/sample floor setup actions in the terminal
- these actions are useful for staging, but not appropriate as a normal shop
  control

Code references:

- `apps/staff-web/components/outlet-tables-page.tsx:458`
- `apps/staff-web/components/outlet-tables-page.tsx:537`
- `apps/staff-web/components/outlet-tables-page.tsx:540`
- `apps/staff-web/components/outlet-tables-page.tsx:617`
- `apps/staff-web/components/outlet-tables-page.tsx:676`

Impact:

- staff can mistake scaffolding actions for production workflow
- the tables view feels less trustworthy and less polished

Required fix:

- move demo setup behind a staging-only admin toggle
- keep production table screens focused on service actions only

### 5.5 Orders default too broad for live service scanning

Severity: `Medium`

Observed issue:

- the orders screen initializes with `ALL` statuses
- this increases noise for a live service operator

Code reference:

- `apps/staff-web/components/outlet-orders-page.tsx:63`

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

### 7.2 Staff lands on the main dashboard

Result: `Partial`

Notes:

- information is present
- page still reads more like a metrics board than an operating console

Improvement:

- compress supporting metrics
- elevate next actions

### 7.3 Staff switches between primary work areas

Result: `Partial`

Notes:

- possible, but mental model is not yet tight
- route grouping is still inconsistent

Improvement:

- unify navigation and shrink decision load

### 7.4 Cashier opens POS and starts a walk-in order

Result: `Pass`

Notes:

- possible today
- structure exists for item selection and ticket creation

Improvement:

- keep category, item list, and cart all above the fold on common screen sizes

### 7.5 Cashier searches for menu items

Result: `Partial`

Notes:

- search exists, but menu maintenance and selling flow still feel too separate

Improvement:

- make item discovery denser
- expose add/edit menu actions more clearly

### 7.6 Cashier adds an item with modifiers

Result: `Pass`

Notes:

- modifier logic works

Improvement:

- tighten the modifier and ticket layout for faster touch operation

### 7.7 Cashier edits quantity and removes items

Result: `Pass`

Notes:

- core editing exists

Improvement:

- make quantity controls more compact and more visually grouped

### 7.8 Cashier checks out with online payment

Result: `Pass`

Notes:

- payment flow works
- already validated against HitPay sandbox earlier in staging work

Improvement:

- align language and supported method display fully with live configuration

### 7.9 Cashier checks out with cash

Result: `Pass / Partial`

Notes:

- cash path exists
- totals and tendering can still feel visually bulky

Improvement:

- make payment summary more glanceable

### 7.10 Staff opens the live orders queue

Result: `Partial`

Notes:

- queue is technically useful
- scanning is slower than it should be because cards are still oversized and
  verbose

Improvement:

- denser queue cards
- stronger action grouping

### 7.11 Staff resumes a customer-originated order from QR

Result: `Partial`

Notes:

- order visibility exists
- order handoff is present
- the UX still makes the staff read too much before acting

Improvement:

- design around “next best action” rather than record inspection

### 7.12 Staff uses the tables view to understand the room

Result: `Partial`

Notes:

- there is progress toward a floor board
- still not yet comparable to a true table map used in production POS systems

Improvement:

- make tables page the widest, most visual room surface
- remove non-essential copy

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

### 7.14 Kitchen reviews the ticket pipeline

Result: `Partial`

Notes:

- lane structure exists
- text density and card sizing still reduce fast readability

Improvement:

- convert kitchen into tighter columns with compact action cards

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

### 8.4 Kitchen

Current state:

- conceptually sound, visually noisy

What is good:

- ticket lanes exist
- order state progression is represented

What still hurts:

- card content still overflows the available scanning budget
- the kitchen should read like a board, not like stacked report tiles

### 8.5 Menus

Current state:

- read/control surface exists
- creation and editing affordances are still not obvious enough

What is good:

- outlet menu context is visible

What still hurts:

- staff cannot naturally understand where to add menu items
- menu management still feels too back-office for a live service terminal

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

## 9. Priority Remediation Plan

### P0: Must fix before claiming shop-floor readiness

- fix attendance policy behavior
- remove or hide demo-floor actions from normal staff flow
- unify navigation model
- clean payment method naming and supported method logic
- compress Orders and KDS into genuinely scannable boards

### P1: Next wave of usability upgrades

- turn Tables into a true room-first floor map
- make POS denser and more touch-efficient
- expose menu add/edit clearly from the Menus workspace
- default orders to actionable filters

### P2: After the terminal becomes stable

- add stronger empty states and error recovery
- tune role-based entry states
- add real printer-state overlays once hardware is available

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
