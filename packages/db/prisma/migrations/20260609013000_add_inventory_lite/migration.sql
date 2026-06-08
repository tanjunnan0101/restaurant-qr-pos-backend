CREATE TYPE "StockMovementType" AS ENUM (
  'PURCHASE',
  'SALE_DEDUCTION',
  'WASTAGE',
  'ADJUSTMENT',
  'STOCK_COUNT',
  'OPENING_BALANCE'
);

CREATE TABLE "inventory_items" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "sku" VARCHAR(80),
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(120),
  "base_unit" VARCHAR(40) NOT NULL,
  "purchase_unit" VARCHAR(40),
  "conversion_rate" DECIMAL(12,4) NOT NULL DEFAULT 1,
  "reorder_point" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "low_stock_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_items_outlet_id_sku_key"
  ON "inventory_items"("outlet_id", "sku");

CREATE INDEX "inventory_items_company_id_outlet_id_active_idx"
  ON "inventory_items"("company_id", "outlet_id", "active");

CREATE INDEX "inventory_items_outlet_id_name_idx"
  ON "inventory_items"("outlet_id", "name");

CREATE TABLE "recipes" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sale_deduction_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipes_menu_item_id_key"
  ON "recipes"("menu_item_id");

CREATE INDEX "recipes_company_id_outlet_id_active_idx"
  ON "recipes"("company_id", "outlet_id", "active");

CREATE TABLE "recipe_ingredients" (
  "recipe_id" UUID NOT NULL,
  "inventory_item_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "quantity" DECIMAL(12,4) NOT NULL,
  "unit" VARCHAR(40) NOT NULL,
  CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("recipe_id", "inventory_item_id")
);

CREATE INDEX "recipe_ingredients_inventory_item_id_idx"
  ON "recipe_ingredients"("inventory_item_id");

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "inventory_item_id" UUID NOT NULL,
  "movement_type" "StockMovementType" NOT NULL,
  "quantity_delta" DECIMAL(12,4) NOT NULL,
  "unit" VARCHAR(40) NOT NULL,
  "reference_type" VARCHAR(80),
  "reference_id" UUID,
  "reason" VARCHAR(500),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movements_company_id_outlet_id_created_at_idx"
  ON "stock_movements"("company_id", "outlet_id", "created_at" DESC);

CREATE INDEX "stock_movements_inventory_item_id_created_at_idx"
  ON "stock_movements"("inventory_item_id", "created_at" DESC);

CREATE INDEX "stock_movements_reference_type_reference_id_idx"
  ON "stock_movements"("reference_type", "reference_id");

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipes"
  ADD CONSTRAINT "recipes_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipes"
  ADD CONSTRAINT "recipes_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipes"
  ADD CONSTRAINT "recipes_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey"
  FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
