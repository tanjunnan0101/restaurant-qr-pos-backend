# Staff Sakorio UI/UX Redesign Brief

Status date: 2026-06-09

Owner: Product / UX / Frontend handoff

Target surface:

- `apps/staff-web`
- staging URL: `https://staff.sakorio.com`

Reference inputs:

- Behance concept: [POS for Restaurant | Table Booking POS System | UI/UX](https://www.behance.net/gallery/116691607/POS-for-Restaurant-Table-Booking-POS-System-UIUX)
- Toast POS ordering patterns: [Manage Orders With Toast POS](https://support.toasttab.com/en/article/New-POS-Experience-Ordering-Screens)
- Oracle configurable restaurant POS patterns: [Retail-J Configurable POS User Interface](https://docs.oracle.com/cd/E62115_01/retailj/pdf/121/RetailJConfigurablePOSUserInterface.pdf)
- SmartPOS ordering workflow guide: [SmartPOS_Eng_Guide_v2.pdf](https://www.smartordersystem.com/document/SmartPOS_Eng_Guide_v2.pdf)

## 1. Objective

This brief defines how `staff.sakorio.com` should be redesigned so it behaves
like a production restaurant terminal rather than an internal operations
dashboard.

The goal is not to clone the Behance concept pixel-for-pixel. The goal is to
adopt its strongest operating qualities:

- touch-first terminal layout
- compact navigation
- strong table and order context
- category-to-item ordering flow
- persistent ticket visibility
- fast transition from item selection to send to payment
- clear handling of dine-in, QR, waiter, and counter orders in one system

This redesign must merge into the existing Sakorio backend, realtime events,
QR order flow, payment settings, inventory lite, printing flow, and outlet
permissions.

## 2. What The Reference Teaches Us

This is a practical interpretation of the Behance concept, cross-checked
against real restaurant POS patterns from Toast, Oracle Retail-J, and
SmartPOS.

### 2.1 Core visual lessons

The Behance concept is effective because:

- the screen feels like a workstation, not a report
- the active task dominates the layout
- the order ticket is always present
- categories are obvious and fast to switch
- table state is surfaced visually
- actions are grouped by workflow moment
- large text is used selectively for focus, not for explanation
- color is used to express status, not decoration

### 2.2 Core workflow lessons

The reference implies a strong restaurant operating model:

1. Operator lands on a service overview.
2. Operator opens a table or counter order fast.
3. Operator browses categories, not forms.
4. Operator builds a ticket while keeping totals visible.
5. Operator can send, print, or pay without route changes.
6. Table state and order state remain visible while service continues.

### 2.3 Cross-check against real POS systems

Toast confirms several important operational patterns:

- the check remains visible while items are added
- search, category access, and payment actions stay near the primary task
- overflow actions such as split, transfer, reprint, and discount belong near
  the live check, not deep inside admin forms

Oracle Retail-J reinforces these ideas:

- the restaurant screen is a POS plus table-state workflow
- hospitality UI depends on status color and table-state awareness
- command-driven item entry is faster than generic CRUD-style editing

SmartPOS reinforces:

- category-first ordering
- visible left-side ticket behavior
- send, print, and confirm actions inside the ordering flow itself

### 2.4 What is wrong with the current staff surface

The current staff app has good backend wiring but weak service ergonomics:

- too much permanent copy
- too many explanatory paragraphs
- shell chrome competes with the active task
- outlet context is repeated and oversized
- POS still feels like a form workflow
- table state and order state are not unified visually
- QR orders exist technically but do not feel native inside the cashier flow

## 3. Product Direction For Staff Sakorio

### 3.1 Product positioning

`staff.sakorio.com` should feel like:

- an iPad-first restaurant workstation
- usable on tablet first, laptop second, mobile fallback third
- calm during rush
- dense but not noisy
- repeatable for all-day shift use

### 3.2 Design goals

1. Reduce reading.
2. Keep primary actions visible.
3. Keep the active ticket persistent.
4. Make table state obvious through color, count, and shape.
5. Let staff switch between QR-driven and cashier-driven orders without a
   mental reset.
6. Minimize route changes for primary service tasks.
7. Make the app practical for one-handed tablet operation.

### 3.3 Design anti-goals

Do not:

- build marketing-style hero sections into service screens
- require staff to read long instructions before acting
- hide payment actions inside secondary panels
- mix owner admin UX into active staff workflow
- force users to open multiple screens to understand the room

## 4. Information Architecture

The staff app should be organized around five primary operational modes and a
small support layer.

### 4.1 Primary modes

1. `Service`
2. `POS`
3. `Tables`
4. `Kitchen`
5. `Orders`

### 4.2 Support modes

- `Inventory`
- `Printing`
- `Menus`
- `Attendance`
- `Team`

### 4.3 Route mapping into the current app

- `/dashboard`
  - becomes `Service`
- `/outlets/[outletId]/pos`
  - remains the main `POS`
- `/outlets/[outletId]/tables`
  - becomes `Tables`
- `/outlets/[outletId]/kds`
  - becomes `Kitchen`
- `/outlets/[outletId]/orders`
  - becomes `Orders`
- `/outlets/[outletId]/inventory`
  - remains `Inventory`
- `/outlets/[outletId]/printing`
  - remains `Printing`
- `/outlets/[outletId]/menus`
  - remains `Menus`
- `/outlets/[outletId]/attendance`
  - remains `Attendance`
- `/outlets/[outletId]/staff`
  - remains `Team`

### 4.4 Navigation hierarchy

Primary nav should only show:

- Service
- POS
- Tables
- Kitchen
- Orders

Secondary nav should show:

- Inventory
- Printing
- Menus
- Attendance
- Team

## 5. Global UX System

### 5.1 Terminal skeleton

All primary staff screens should share the same shell:

1. compact left rail
2. compact top command strip
3. main task area
4. optional right-side persistent action or detail rail

### 5.2 Density rules

- Use short labels.
- Keep support text optional.
- Prefer chips, badges, bars, and grouped actions over essay cards.
- Use cards only when they group a real operational unit.
- Reduce static copy on active screens by at least 50 percent from the current
  baseline.

### 5.3 Status color rules

Status colors must be consistent across POS, tables, orders, KDS, printing,
and inventory.

- `green`: paid, ready, available, completed
- `amber`: pending, waiting, reserved, payment in progress
- `red`: blocked, failed, voided, sold out, out of service
- `blue/teal`: current context, selected mode, active live state
- `neutral`: history, archived, inactive metadata

### 5.4 Typography rules

- Use a strong sans serif for numbers, counters, totals, and operational
  labels.
- Remove large serif display headings from rush-hour pages.
- Keep emphasis on totals, counts, statuses, and button clarity.
- Use one-line section headers wherever possible.

### 5.5 Core reusable components

The redesign should standardize these shared components:

- compact terminal sidebar
- outlet command strip
- category chip row
- item card
- active ticket row
- table status chip
- live order tile
- payment method pill
- station badge
- quick action cluster
- overflow action drawer
- split panel modal

## 6. Screen-By-Screen Redesign Spec

### 6.1 Service Board

Purpose:

- answer "what needs attention right now?"

Must show:

- live queue count
- ready-to-run count
- unpaid count
- occupied tables
- help requests
- printer failures
- current outlet access

Layout:

- top command strip with outlet switcher, session info, sync state, and
  quick-launch actions
- first row of 4 to 6 KPI tiles
- second row of action tiles:
  - payment attention
  - kitchen attention
  - floor attention
  - help requests
- third row of outlet boards or station boards

Primary actions:

- open POS
- open the active table map
- open unpaid orders
- open kitchen board

Merge into Sakorio:

- reuse existing dashboard aggregation data
- replace narrative hero content with a dense command board
- source data from current outlets, orders, tables, printing, and realtime
  event streams

### 6.2 POS Terminal

Purpose:

- create and settle counter, waiter, and table-linked orders quickly

This is the highest-value redesign target.

#### Structure

Use a three-zone terminal:

1. `Context strip`
   - outlet
   - order type
   - table or counter source
   - guest count
   - active menu
   - payment state
2. `Menu workspace`
   - category chips on top
   - search always visible
   - item grid below
3. `Ticket rail`
   - live order feed at the top
   - editable active ticket below
   - totals and payment actions pinned near the bottom

#### Top strip requirements

Must include:

- current outlet
- service type selector
- menu selector
- current ticket state
- online card toggle state
- realtime sync state

#### Category and menu flow

Behavior:

- categories are horizontal chips
- item search stays visible while scrolling
- item cards show:
  - item name
  - price
  - station or prep area
  - sold out state
  - quick add or customize action
- long-press or secondary tap opens modifiers

#### Ticket rail requirements

The ticket rail must remain visible while browsing items.

It contains:

- item rows with quantity controls
- modifier summary
- notes
- draft or sent state
- discount summary
- service charge and GST summary
- totals
- payment actions

#### Live order feed requirements

This is mandatory because Sakorio has QR orders.

The POS must show a compact live feed of:

- QR orders
- cashier-created orders
- waiter-created orders

Each live order tile must show:

- order number
- source type
- table or counter source
- payment status
- fulfillment status
- amount
- "Open" primary action

QR activity must feel native inside the cashier terminal, not bolted on.

#### Visible payment action group

Primary visible actions:

- charge online card
- record cash
- hold draft
- reopen unpaid
- print pre-payment bill

Overflow actions:

- cancel order
- manager discount override
- move to another table
- split bill
- merge check
- reprint receipt

#### Merge into Sakorio

Keep existing backend semantics:

- menu fetch and detail logic
- current staff order create and amend flow
- checkout creation
- payment settings APIs
- printer calls
- realtime outlet subscriptions

Refactor screen structure and interaction hierarchy only. Do not rewrite
server-authoritative pricing or payment rules.

### 6.3 Tables

Purpose:

- let service crew understand the room instantly

Must support two views:

1. `Floor`
2. `List`

#### Floor view

Even without a true drag-and-drop floor editor, the UI should feel like a live
floor board:

- zone sections with visual grouping
- table cards with strong status color
- table code as the main label
- guest help badge
- active order count
- QR attached or missing state
- latest order status

#### Table card actions

Primary:

- open in POS
- open table orders
- resolve help request

Secondary:

- rotate QR
- mark reserved
- mark available
- mark out of service

#### Table visual hierarchy

Each table card must clearly show:

- table code or display name
- status
- number of live checks
- latest payment state
- zone
- QR coverage state

#### Merge into Sakorio

- reuse current table APIs and QR APIs
- reuse the existing table status model
- promote "Open in POS" to the dominant action
- connect any QR-originating order visibly back to the table card

### 6.4 Orders Board

Purpose:

- handle exceptions, recovery, and non-linear service tasks

This is the control tower for orders not currently being edited in POS.

Must support:

- status tabs
- payment tabs
- source tabs
- age sorting
- quick recovery actions

Group orders by:

- awaiting payment
- in kitchen
- ready
- served
- blocked or failed

Quick actions:

- open in POS
- regenerate checkout
- mark cash paid
- print pre-payment bill
- reprint receipt
- cancel before release

Merge into Sakorio:

- keep existing order fetch and action APIs
- replace heavy text cards with action tiles or list rows
- use the same status chip language as POS and Tables

### 6.5 Kitchen

Purpose:

- let kitchen and expo move tickets through stages quickly

The KDS should feel like a dense pass board, not a dashboard.

Must support:

- station filtering
- course or course-group display if available
- ticket timers
- modifier emphasis
- bump to next state
- expo-ready visual clarity

Each ticket must show:

- order number
- source
- table or counter source
- age
- items
- modifiers
- notes
- status

Primary actions:

- start preparing
- mark ready
- mark served or handed off where permitted

Merge into Sakorio:

- preserve current KDS route and realtime logic
- compress tile layout
- emphasize timers and stage buttons

### 6.6 Menus In Staff

Purpose:

- allow service-time menu operations without sending staff into owner-web

Staff menu editing is not full authoring. It is operational control.

Must support:

- sold out toggle
- item availability
- quick price override placeholder if role allows later
- category filtering
- search

The screen should resemble a service control grid, not an admin editor.

Merge into Sakorio:

- preserve current quick draft add and visibility logic
- keep owner-web as the full menu authoring surface

### 6.7 Printing

Purpose:

- help operators react to print failures immediately

Must show:

- printer health
- last heartbeat
- recent failures
- retry actions
- printer role

Primary actions:

- retry failed print job
- reprint receipt
- reprint kitchen ticket
- test printer

### 6.8 Inventory

Purpose:

- let staff perform lightweight stock operations during service

Must support:

- low-stock visibility
- quick stock-in or stock-out
- wastage logging
- recipe or BOM context where useful

This should remain compact and operational, not analytic-heavy.

## 7. Workflow Mapping Into Sakorio

### 7.1 Customer QR order flow into staff POS

Required unified flow:

1. Customer scans QR and places an order on `order.sakorio.com`.
2. Backend creates the order and emits outlet updates.
3. Staff sees the order appear in:
   - POS live feed
   - Orders board
   - relevant table card
   - KDS when released to kitchen
4. Cashier can open the order from POS without route change.
5. Payment or recovery actions remain available from POS or Orders.

### 7.2 Table-service flow

1. Staff taps a table from `Tables`.
2. Staff opens the linked POS context.
3. POS inherits:
   - outlet
   - table
   - dine-in context
4. Staff adds items, sends to kitchen, prints bill, or settles payment.
5. Table state updates immediately.

### 7.3 Counter walk-in flow

1. Staff opens `POS`.
2. Context defaults to counter order.
3. Staff searches or taps categories.
4. Ticket rail updates live.
5. Staff takes payment and closes the order without needing tables.

### 7.4 Payment recovery flow

1. Order appears unpaid or payment fails.
2. Staff finds it from POS live feed or Orders board.
3. Staff can:
   - regenerate hosted checkout
   - mark manual cash if allowed
   - print pre-payment bill
   - cancel before kitchen release

## 8. Detailed Merge Plan Against Current Codebase

### 8.1 Shared shell

Current files:

- `apps/staff-web/components/staff-page-frame.tsx`
- `apps/staff-web/components/outlet-page-base.tsx`
- `apps/staff-web/app/globals.css`

Required direction:

- shrink shell copy
- keep left rail compact
- switch to icon-first nav
- move outlet context into a short command strip
- make each page header short and task-oriented

### 8.2 POS page

Current file:

- `apps/staff-web/components/outlet-pos-page.tsx`

Required direction:

- keep current backend interactions
- rebuild the page into:
  - command strip
  - category bar plus item grid
  - persistent ticket rail
  - live order feed
- reduce text footprint by at least half
- improve touch target sizing

### 8.3 Orders page

Current file:

- `apps/staff-web/components/outlet-orders-page.tsx`

Required direction:

- shift from text-heavy master-detail to grouped action board
- emphasize aging, payment status, and recovery actions
- visually align order rows with POS live feed tiles

### 8.4 Tables page

Current file:

- `apps/staff-web/components/outlet-tables-page.tsx`

Required direction:

- keep current data model
- shift to floor-first operational board
- use clearer status chips and stronger occupancy indicators
- make "Open in POS" the dominant action

### 8.5 KDS page

Current file:

- `apps/staff-web/components/outlet-kds-page.tsx`

Required direction:

- keep current logic
- improve ticket density
- strengthen timer visibility
- make stage actions larger and faster to hit

### 8.6 Menu quick edit page

Current file:

- `apps/staff-web/components/outlet-menus-page.tsx`

Required direction:

- preserve quick service controls
- redesign into compact category-driven tooling
- avoid the owner-web editor mental model

## 9. Twenty Use Cases For Refinement

These use cases should be used during design review and QA.

1. Cashier creates a walk-in order during a queue spike and reaches payment in
   under 20 seconds.
2. Waiter opens POS from a table card and adds items to an existing dine-in
   check.
3. Customer places a QR order and the cashier sees it appear in the POS live
   feed without refreshing.
4. Manager opens an unpaid QR order and regenerates the hosted checkout link.
5. Cashier records cash for a dine-in ticket and sees exact change due before
   finalizing.
6. Staff marks an item sold out during service without leaving staff-web.
7. Floor staff resolves a guest help request directly from the tables screen.
8. Host sees a reserved table become occupied and opens the linked POS flow
   immediately.
9. Kitchen staff sees a new QR order with modifiers and moves it from sent to
   preparing.
10. Cashier reopens a held draft and continues to payment.
11. Staff moves from Service Board to a specific order in one tap.
12. Staff identifies which tables are missing QR coverage from the floor
    board.
13. Cashier applies a discount and the UI clearly marks it as a manager-level
    action if required.
14. Waiter prints a pre-payment bill without losing ticket context.
15. Manager spots a printer failure from staff-web and retries the failed job.
16. Staff searches the menu by item name and adds it without route changes.
17. Cashier quickly distinguishes QR orders from counter orders in the live
    feed.
18. Staff inspects which orders are unpaid versus already in kitchen.
19. Inventory clerk records wastage from a compact service-time action panel.
20. During dinner rush, an operator understands the outlet state from the
    first visible screen within 3 seconds.

## 10. Acceptance Criteria

### 10.1 Usability

- A first-time staff user can identify the main cashier action within 3
  seconds.
- The POS page shows menu selection, active ticket, and live queue without
  scrolling on tablet.
- The table screen shows occupancy and help state without opening table
  detail.
- QR orders feel native to staff operations, not like a separate subsystem.

### 10.2 Interaction

- No primary task requires reading a paragraph to continue.
- Primary actions remain visible in the active workspace.
- Category switching is fast and visually stable.
- Status colors are consistent across modules.

### 10.3 Technical

- Existing backend APIs remain valid.
- Existing realtime outlet subscriptions remain valid.
- Existing printer, payment, and table flows remain intact.
- Existing server-authoritative pricing remains unchanged.

## 11. Delivery Phasing

Recommended implementation order:

1. compact shell and command strip
2. POS terminal redesign
3. live QR and cashier feed unification
4. Tables floor-board redesign
5. Orders board redesign
6. KDS visual redesign
7. Printing and inventory operational polish

## 12. QA Of This Brief

This brief has been checked against the current Sakorio system so it can be
handed safely to another developer.

### 12.1 What already exists and must be preserved

- staff JWT auth
- outlet-scoped RBAC
- QR order ingestion
- HitPay customer checkout flow
- table and QR management APIs
- online card availability toggles
- staff POS create and amend flow
- pre-payment bill printing
- KDS route and outlet realtime subscriptions
- inventory lite APIs and screens

### 12.2 What this brief does not require in the first pass

- native mobile app
- offline-first rewrite
- vector floorplan editor
- full split-bill backend
- seat-level kitchen sequencing backend
- reservation engine

### 12.3 Main risks

- making the shell decorative again
- leaving too much explanatory text in terminal screens
- mixing owner-style admin UX into staff workflow
- failing to unify QR and cashier orders visually
- building pretty tiles without strong primary actions

### 12.4 QA questions for the next developer

1. Can the cashier go from menu selection to payment without route change?
2. Can a QR order be found from POS, Orders, and Tables?
3. Is table state color-consistent with order state?
4. Are primary actions stronger than secondary actions?
5. Is the shell compact enough for tablet use?
6. Is any paragraph on the primary service path still too long?
7. Does each page answer one operational question clearly?

## 13. Recommended Immediate Scope

If only one high-value slice is implemented next, it should be:

1. shell cleanup
2. POS redesign
3. live feed unification of QR and cashier orders
4. tables redesign

That gives the biggest improvement to actual in-shop usability.

## 14. Final Review Summary

This brief is ready for developer handoff because it:

- clearly defines target screens
- maps them to current Sakorio routes
- explains how to preserve the current backend model
- adds explicit merge guidance
- includes testable use cases
- includes acceptance criteria and QA prompts

Required companion:

- `docs/runbooks/staff-terminal-qa-2026-06-11.md`

The redesign brief defines the intended terminal. The QA runbook defines the
current gaps still preventing `staff.sakorio.com` from feeling shop-floor
ready. Future staff-web work should read both together.

## 15. Source Notes

This brief is based on:

- direct review of the Behance restaurant POS concept page and project metadata
- direct review of the current `apps/staff-web` implementation
- cross-checking against operational patterns documented by Toast, Oracle
  Retail-J, and SmartPOS

Important note:

- Behance is being used here as a workflow and ergonomics reference, not as a
  literal screen-copy instruction.
- The resulting implementation should be original Sakorio product work that
  adopts the reference's strengths while fitting the current Sakorio system.
