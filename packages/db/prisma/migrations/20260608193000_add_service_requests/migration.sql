CREATE TYPE "ServiceRequestType" AS ENUM ('CALL_STAFF', 'REQUEST_BILL');

CREATE TYPE "ServiceRequestStatus" AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'CANCELLED'
);

CREATE TABLE "service_requests" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "table_id" UUID NOT NULL,
  "table_session_id" UUID,
  "qr_code_id" UUID,
  "type" "ServiceRequestType" NOT NULL,
  "status" "ServiceRequestStatus" NOT NULL DEFAULT 'OPEN',
  "note" VARCHAR(500),
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ(6),
  "resolved_at" TIMESTAMPTZ(6),
  "resolved_by_user_id" UUID,
  "resolution_note" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_requests_company_id_outlet_id_status_requested_at_idx"
  ON "service_requests"("company_id", "outlet_id", "status", "requested_at" DESC);

CREATE INDEX "service_requests_table_id_status_requested_at_idx"
  ON "service_requests"("table_id", "status", "requested_at" DESC);

CREATE INDEX "service_requests_table_session_id_status_requested_at_idx"
  ON "service_requests"("table_session_id", "status", "requested_at" DESC);

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_table_id_fkey"
  FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_table_session_id_fkey"
  FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_qr_code_id_fkey"
  FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
