-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MenuVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MenuChannel" AS ENUM ('QR', 'POS', 'BOTH');

-- CreateEnum
CREATE TYPE "DiningTableShape" AS ENUM ('SQUARE', 'CIRCLE', 'RECTANGLE');

-- CreateEnum
CREATE TYPE "DiningTableStatus" AS ENUM ('AVAILABLE', 'INACTIVE');

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "channel" "MenuChannel" NOT NULL DEFAULT 'BOTH',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "MenuStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_versions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "MenuVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "menu_version_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "menu_version_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "sku" VARCHAR(80),
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "base_price_cents" INTEGER NOT NULL,
    "cost_price_cents" INTEGER,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "service_chargeable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sold_out" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_variants" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "menu_version_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_options" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_modifier_groups" (
    "menu_item_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("menu_item_id","modifier_group_id")
);

-- CreateTable
CREATE TABLE "dining_zones" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dining_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "table_code" VARCHAR(40) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "shape" "DiningTableShape" NOT NULL DEFAULT 'SQUARE',
    "status" "DiningTableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "public_code" VARCHAR(40) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "destination_path" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(6),

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menus_company_id_outlet_id_status_idx" ON "menus"("company_id", "outlet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "menus_outlet_id_slug_key" ON "menus"("outlet_id", "slug");

-- CreateIndex
CREATE INDEX "menu_versions_company_id_menu_id_status_idx" ON "menu_versions"("company_id", "menu_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "menu_versions_menu_id_version_number_key" ON "menu_versions"("menu_id", "version_number");

-- CreateIndex
CREATE INDEX "menu_categories_menu_version_id_display_order_idx" ON "menu_categories"("menu_version_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_menu_version_id_name_key" ON "menu_categories"("menu_version_id", "name");

-- CreateIndex
CREATE INDEX "menu_items_menu_version_id_category_id_active_display_order_idx" ON "menu_items"("menu_version_id", "category_id", "active", "display_order");

-- CreateIndex
CREATE INDEX "menu_items_company_id_sold_out_active_idx" ON "menu_items"("company_id", "sold_out", "active");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_menu_version_id_sku_key" ON "menu_items"("menu_version_id", "sku");

-- CreateIndex
CREATE INDEX "item_variants_menu_item_id_display_order_idx" ON "item_variants"("menu_item_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "item_variants_menu_item_id_name_key" ON "item_variants"("menu_item_id", "name");

-- CreateIndex
CREATE INDEX "modifier_groups_menu_version_id_display_order_idx" ON "modifier_groups"("menu_version_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_groups_menu_version_id_key_key" ON "modifier_groups"("menu_version_id", "key");

-- CreateIndex
CREATE INDEX "modifier_options_modifier_group_id_display_order_idx" ON "modifier_options"("modifier_group_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_options_modifier_group_id_name_key" ON "modifier_options"("modifier_group_id", "name");

-- CreateIndex
CREATE INDEX "menu_item_modifier_groups_modifier_group_id_idx" ON "menu_item_modifier_groups"("modifier_group_id");

-- CreateIndex
CREATE INDEX "dining_zones_company_id_outlet_id_display_order_idx" ON "dining_zones"("company_id", "outlet_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "dining_zones_outlet_id_name_key" ON "dining_zones"("outlet_id", "name");

-- CreateIndex
CREATE INDEX "dining_tables_company_id_outlet_id_status_idx" ON "dining_tables"("company_id", "outlet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_outlet_id_table_code_key" ON "dining_tables"("outlet_id", "table_code");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_public_code_key" ON "qr_codes"("public_code");

-- CreateIndex
CREATE INDEX "qr_codes_company_id_outlet_id_active_idx" ON "qr_codes"("company_id", "outlet_id", "active");

-- CreateIndex
CREATE INDEX "qr_codes_table_id_active_idx" ON "qr_codes"("table_id", "active");

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_versions" ADD CONSTRAINT "menu_versions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_versions" ADD CONSTRAINT "menu_versions_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_menu_version_id_fkey" FOREIGN KEY ("menu_version_id") REFERENCES "menu_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_version_id_fkey" FOREIGN KEY ("menu_version_id") REFERENCES "menu_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_menu_version_id_fkey" FOREIGN KEY ("menu_version_id") REFERENCES "menu_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_zones" ADD CONSTRAINT "dining_zones_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_zones" ADD CONSTRAINT "dining_zones_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "dining_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
