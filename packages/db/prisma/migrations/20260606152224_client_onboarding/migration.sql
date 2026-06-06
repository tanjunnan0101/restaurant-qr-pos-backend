-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING_OWNER_ACTIVATION', 'IN_PROGRESS', 'READY_FOR_PILOT', 'COMPLETED');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'PENDING_ACTIVATION';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "client_onboardings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING_OWNER_ACTIVATION',
    "business_profile_completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_activated_at" TIMESTAMPTZ(6),
    "payment_methods_selected_at" TIMESTAMPTZ(6),
    "stripe_connected_at" TIMESTAMPTZ(6),
    "menu_published_at" TIMESTAMPTZ(6),
    "tables_configured_at" TIMESTAMPTZ(6),
    "printer_configured_at" TIMESTAMPTZ(6),
    "test_order_completed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activation_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_onboardings_company_id_key" ON "client_onboardings"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_onboardings_owner_user_id_key" ON "client_onboardings"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_onboardings_idempotency_key_key" ON "client_onboardings"("idempotency_key");

-- CreateIndex
CREATE INDEX "client_onboardings_status_created_at_idx" ON "client_onboardings"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_activation_tokens_token_hash_key" ON "user_activation_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "user_activation_tokens_user_id_expires_at_idx" ON "user_activation_tokens"("user_id", "expires_at");

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activation_tokens" ADD CONSTRAINT "user_activation_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
