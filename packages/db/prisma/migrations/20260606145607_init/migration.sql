-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OutletStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE_CARD', 'STRIPE_PAYNOW', 'MANUAL_PAYNOW');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(200),
    "registration_number" VARCHAR(80),
    "default_currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "default_timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Singapore',
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(40),
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Singapore',
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "gst_enabled" BOOLEAN NOT NULL DEFAULT true,
    "gst_rate_bps" INTEGER NOT NULL DEFAULT 900,
    "service_charge_enabled" BOOLEAN NOT NULL DEFAULT false,
    "service_charge_bps" INTEGER NOT NULL DEFAULT 1000,
    "status" "OutletStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pos_pin_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "system_key" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(80) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_outlet_access" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_outlet_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_payment_controls" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "online_payments_enabled" BOOLEAN NOT NULL DEFAULT true,
    "online_disabled_until" TIMESTAMPTZ(6),
    "online_disabled_reason" TEXT,
    "stripe_payments_enabled" BOOLEAN NOT NULL DEFAULT true,
    "stripe_disabled_until" TIMESTAMPTZ(6),
    "stripe_disabled_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlet_payment_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_method_settings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabled_until" TIMESTAMPTZ(6),
    "disabled_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_method_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID,
    "actor_user_id" UUID,
    "action_type" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "request_id" VARCHAR(100),
    "ip_address" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "outlets_company_id_status_idx" ON "outlets"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_company_id_slug_key" ON "outlets"("company_id", "slug");

-- CreateIndex
CREATE INDEX "users_company_id_status_idx" ON "users"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_email_key" ON "users"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_company_id_system_key_key" ON "roles"("company_id", "system_key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "user_outlet_access_company_id_outlet_id_idx" ON "user_outlet_access"("company_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_outlet_access_user_id_outlet_id_role_id_key" ON "user_outlet_access"("user_id", "outlet_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_payment_controls_outlet_id_key" ON "outlet_payment_controls"("outlet_id");

-- CreateIndex
CREATE INDEX "outlet_payment_controls_company_id_outlet_id_idx" ON "outlet_payment_controls"("company_id", "outlet_id");

-- CreateIndex
CREATE INDEX "payment_method_settings_company_id_outlet_id_idx" ON "payment_method_settings"("company_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_settings_outlet_id_method_key" ON "payment_method_settings"("outlet_id", "method");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_outlet_id_action_type_created_at_idx" ON "audit_logs"("company_id", "outlet_id", "action_type", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlet_access" ADD CONSTRAINT "user_outlet_access_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlet_access" ADD CONSTRAINT "user_outlet_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlet_access" ADD CONSTRAINT "user_outlet_access_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlet_access" ADD CONSTRAINT "user_outlet_access_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_payment_controls" ADD CONSTRAINT "outlet_payment_controls_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_payment_controls" ADD CONSTRAINT "outlet_payment_controls_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_payment_controls" ADD CONSTRAINT "outlet_payment_controls_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_settings" ADD CONSTRAINT "payment_method_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_settings" ADD CONSTRAINT "payment_method_settings_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method_settings" ADD CONSTRAINT "payment_method_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
