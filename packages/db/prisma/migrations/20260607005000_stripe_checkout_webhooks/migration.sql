-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "checkout_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "creation_idempotency_key" VARCHAR(120),
ADD COLUMN     "net_amount_cents" INTEGER,
ADD COLUMN     "provider_fee_cents" INTEGER,
ADD COLUMN     "stripe_charge_id" VARCHAR(255),
ADD COLUMN     "stripe_checkout_session_id" VARCHAR(255),
ADD COLUMN     "stripe_checkout_url" TEXT,
ADD COLUMN     "stripe_payment_intent_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "outlet_id" UUID,
    "payment_id" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(160) NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload_json" JSONB NOT NULL,
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "webhook_events_provider_status_received_at_idx" ON "webhook_events"("provider", "status", "received_at" DESC);

-- CreateIndex
CREATE INDEX "webhook_events_company_id_outlet_id_received_at_idx" ON "webhook_events"("company_id", "outlet_id", "received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_creation_idempotency_key_key" ON "payments"("creation_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_checkout_session_id_key" ON "payments"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_charge_id_key" ON "payments"("stripe_charge_id");

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
