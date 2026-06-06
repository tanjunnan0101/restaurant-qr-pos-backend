-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('SEATED', 'ORDERING', 'ORDERED', 'PREPARING', 'SERVED', 'PAYMENT_PENDING', 'PAID', 'CLEANING', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('QR', 'POS', 'WAITER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'PICKUP', 'COUNTER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'MANUAL_VERIFICATION_REQUIRED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'MANUAL_VERIFICATION_REQUIRED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "KitchenTicketStatus" AS ENUM ('QUEUED', 'SENT', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrinterConnectionType" AS ENUM ('EPSON_EPOS', 'ESC_POS_LAN', 'ESC_POS_USB_BRIDGE', 'BLUETOOTH_BRIDGE', 'BROWSER', 'PDF');

-- CreateEnum
CREATE TYPE "PrinterRole" AS ENUM ('KITCHEN', 'BAR', 'RECEIPT', 'BACKUP');

-- CreateEnum
CREATE TYPE "PrinterHealthStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'OFFLINE', 'DEGRADED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PrintTemplate" AS ENUM ('CUSTOMER_RECEIPT', 'PRE_PAYMENT_BILL', 'KITCHEN_TICKET', 'BAR_TICKET', 'CANCELLED_ITEM_TICKET', 'VOID_TICKET', 'REFUND_RECEIPT', 'DAILY_CLOSING_REPORT', 'SHIFT_CLOSING_REPORT', 'TEST_PRINT');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'SENDING', 'PRINTED', 'FAILED', 'RETRYING', 'CANCELLED', 'REPRINTED');

-- CreateEnum
CREATE TYPE "PrintAttemptStatus" AS ENUM ('SENDING', 'PRINTED', 'FAILED');

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "preparation_station_key" VARCHAR(80) NOT NULL DEFAULT 'main-kitchen';

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "active_table_key" UUID,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'SEATED',
    "seated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sequences" (
    "outlet_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_sequences_pkey" PRIMARY KEY ("outlet_id","business_date")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "table_id" UUID,
    "table_session_id" UUID,
    "order_number" VARCHAR(40) NOT NULL,
    "business_date" DATE NOT NULL,
    "source" "OrderSource" NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "discount_total_cents" INTEGER NOT NULL DEFAULT 0,
    "service_charge_total_cents" INTEGER NOT NULL DEFAULT 0,
    "gst_total_cents" INTEGER NOT NULL DEFAULT 0,
    "rounding_adjustment_cents" INTEGER NOT NULL DEFAULT 0,
    "grand_total_cents" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "customer_name" VARCHAR(160),
    "customer_phone" VARCHAR(40),
    "created_by_user_id" UUID,
    "paid_at" TIMESTAMPTZ(6),
    "sent_to_kitchen_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID,
    "item_name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(80),
    "variant_id" UUID,
    "variant_name" VARCHAR(120),
    "preparation_station_key" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "base_unit_price_cents" INTEGER NOT NULL,
    "modifier_unit_cents" INTEGER NOT NULL DEFAULT 0,
    "unit_price_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "service_chargeable" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "modifier_group_id" UUID,
    "modifier_group_name" VARCHAR(120) NOT NULL,
    "modifier_option_id" UUID,
    "modifier_option_name" VARCHAR(120) NOT NULL,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "manual_reference" VARCHAR(160),
    "verification_idempotency_key" VARCHAR(120),
    "verified_by_user_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_stations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_tickets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "status" "KitchenTicketStatus" NOT NULL DEFAULT 'QUEUED',
    "payload_json" JSONB NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "preparing_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kitchen_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "connection_type" "PrinterConnectionType" NOT NULL,
    "role" "PrinterRole" NOT NULL,
    "host" VARCHAR(255),
    "port" INTEGER,
    "paper_width_mm" INTEGER NOT NULL DEFAULT 80,
    "auto_cut" BOOLEAN NOT NULL DEFAULT true,
    "buzzer" BOOLEAN NOT NULL DEFAULT false,
    "cash_drawer" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "health_status" "PrinterHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "last_test_at" TIMESTAMPTZ(6),
    "last_test_result" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_routes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "primary_printer_id" UUID NOT NULL,
    "backup_printer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "printer_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_agents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "device_id" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "app_version" VARCHAR(40),
    "last_ip_address" VARCHAR(80),
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "printer_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "order_id" UUID,
    "kitchen_ticket_id" UUID,
    "printer_id" UUID,
    "template" "PrintTemplate" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "rendered_text" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leased_by_agent_id" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "backup_routed" BOOLEAN NOT NULL DEFAULT false,
    "printed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "reprint_of_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_job_attempts" (
    "id" UUID NOT NULL,
    "print_job_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "PrintAttemptStatus" NOT NULL,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "print_job_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_active_table_key_key" ON "table_sessions"("active_table_key");

-- CreateIndex
CREATE INDEX "table_sessions_company_id_outlet_id_status_idx" ON "table_sessions"("company_id", "outlet_id", "status");

-- CreateIndex
CREATE INDEX "table_sessions_table_id_created_at_idx" ON "table_sessions"("table_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_outlet_id_status_created_at_idx" ON "orders"("outlet_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_company_id_payment_status_created_at_idx" ON "orders"("company_id", "payment_status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_company_id_idempotency_key_key" ON "orders"("company_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_outlet_id_business_date_order_number_key" ON "orders"("outlet_id", "business_date", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_company_id_preparation_station_key_idx" ON "order_items"("company_id", "preparation_station_key");

-- CreateIndex
CREATE INDEX "order_item_modifiers_order_item_id_idx" ON "order_item_modifiers"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_verification_idempotency_key_key" ON "payments"("verification_idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_status_idx" ON "payments"("order_id", "status");

-- CreateIndex
CREATE INDEX "payments_outlet_id_method_status_created_at_idx" ON "payments"("outlet_id", "method", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "kitchen_stations_company_id_outlet_id_active_idx" ON "kitchen_stations"("company_id", "outlet_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_stations_outlet_id_key_key" ON "kitchen_stations"("outlet_id", "key");

-- CreateIndex
CREATE INDEX "kitchen_tickets_outlet_id_station_id_status_created_at_idx" ON "kitchen_tickets"("outlet_id", "station_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_tickets_order_id_station_id_key" ON "kitchen_tickets"("order_id", "station_id");

-- CreateIndex
CREATE INDEX "printers_company_id_outlet_id_active_idx" ON "printers"("company_id", "outlet_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "printers_outlet_id_key_key" ON "printers"("outlet_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "printer_routes_station_id_key" ON "printer_routes"("station_id");

-- CreateIndex
CREATE INDEX "printer_routes_company_id_outlet_id_idx" ON "printer_routes"("company_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "printer_agents_device_id_key" ON "printer_agents"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "printer_agents_token_hash_key" ON "printer_agents"("token_hash");

-- CreateIndex
CREATE INDEX "printer_agents_company_id_outlet_id_active_idx" ON "printer_agents"("company_id", "outlet_id", "active");

-- CreateIndex
CREATE INDEX "print_jobs_outlet_id_status_priority_created_at_idx" ON "print_jobs"("outlet_id", "status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "print_jobs_printer_id_status_next_attempt_at_idx" ON "print_jobs"("printer_id", "status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "print_job_attempts_agent_id_started_at_idx" ON "print_job_attempts"("agent_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "print_job_attempts_print_job_id_attempt_number_key" ON "print_job_attempts"("print_job_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_session_id_fkey" FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "kitchen_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "kitchen_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_primary_printer_id_fkey" FOREIGN KEY ("primary_printer_id") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_backup_printer_id_fkey" FOREIGN KEY ("backup_printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_agents" ADD CONSTRAINT "printer_agents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_agents" ADD CONSTRAINT "printer_agents_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_kitchen_ticket_id_fkey" FOREIGN KEY ("kitchen_ticket_id") REFERENCES "kitchen_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_leased_by_agent_id_fkey" FOREIGN KEY ("leased_by_agent_id") REFERENCES "printer_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_reprint_of_id_fkey" FOREIGN KEY ("reprint_of_id") REFERENCES "print_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_print_job_id_fkey" FOREIGN KEY ("print_job_id") REFERENCES "print_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "printer_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
