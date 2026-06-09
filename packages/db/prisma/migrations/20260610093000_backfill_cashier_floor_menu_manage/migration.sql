INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role_row."id", permission_row."id"
FROM "roles" AS role_row
JOIN "permissions" AS permission_row
  ON permission_row."key" IN ('menu.manage', 'table.manage', 'qr.manage')
WHERE role_row."system_key" = 'CASHIER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
