INSERT INTO "permissions" ("id", "key", "description", "category")
SELECT gen_random_uuid(), 'company.manage', 'Update company settings', 'company'
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "key" = 'company.manage'
);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role_row."id", permission_row."id"
FROM "roles" AS role_row
JOIN "permissions" AS permission_row
  ON permission_row."key" = 'company.manage'
WHERE role_row."system_key" = 'OWNER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
