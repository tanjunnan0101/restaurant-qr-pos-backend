# Menu and Table Setup

This workflow completes the `menu` and `tables_and_qr` client-onboarding
checklist steps.

## 1. Create the first menu

Call `POST /api/v1/admin/outlets/:outletId/menus/setup` with:

- A unique outlet menu slug.
- One or more categories and items.
- Optional variants and shared modifier groups.
- `publish: true` to make the menu available to QR customers immediately.

Prices are integer cents. For example, `650` represents SGD 6.50.

## 2. Make later menu changes

1. Clone the published menu with
   `POST /api/v1/admin/outlets/:outletId/menus/:menuId/draft/clone`.
2. Replace the draft content with
   `PUT /api/v1/admin/outlets/:outletId/menus/:menuId/draft`.
3. Publish it with
   `POST /api/v1/admin/outlets/:outletId/menus/:menuId/publish`.

Publishing archives the previous version. Sold-out state can be changed
without publishing a new version.

## 3. Configure tables

Call `POST /api/v1/admin/outlets/:outletId/tables/setup` with all dining zones
and tables. The operation upserts zones and tables by zone name and table code,
which makes it suitable for repeatable onboarding.

New tables receive secure QR URLs. Existing QR URLs are not reconstructable
because only token hashes are stored. Set `rotateExistingQr: true` only when
new printable URLs are required.

## 4. Print and rotate QR codes

Store or print each returned `qrUrl` immediately. To invalidate a lost or
exposed code, call:

`POST /api/v1/admin/outlets/:outletId/tables/:tableId/qr/rotate`

The previous QR stops resolving as soon as rotation completes.

## 5. Verify the customer scan

The customer application opens the QR URL and resolves its code and token
through:

`GET /api/v1/public/qr/:publicCode/:token`

Confirm that the response contains the expected table, published menu version,
and payment availability before placing the printed QR on the table.
