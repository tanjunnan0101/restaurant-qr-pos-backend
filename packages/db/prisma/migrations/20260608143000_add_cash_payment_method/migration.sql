CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';

INSERT INTO "payment_method_settings" (
  "id",
  "company_id",
  "outlet_id",
  "method",
  "enabled",
  "version",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  o."company_id",
  o."id",
  'CASH'::"PaymentMethod",
  TRUE,
  1,
  NOW(),
  NOW()
FROM "outlets" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "payment_method_settings" pms
  WHERE pms."outlet_id" = o."id"
    AND pms."method" = 'CASH'::"PaymentMethod"
);
