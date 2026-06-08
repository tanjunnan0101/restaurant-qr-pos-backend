CREATE TYPE "AttendanceSessionStatus" AS ENUM ('CLOCKED_IN', 'CLOCKED_OUT');

CREATE TYPE "AttendanceApprovalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'ADJUSTED',
  'FLAGGED'
);

CREATE TYPE "AttendancePhotoType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT');

CREATE TABLE "attendance_settings" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "require_photo" BOOLEAN NOT NULL DEFAULT false,
  "allow_manual_clock_in" BOOLEAN NOT NULL DEFAULT true,
  "max_shift_hours" INTEGER NOT NULL DEFAULT 16,
  "auto_flag_late_clock_out" BOOLEAN NOT NULL DEFAULT true,
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Singapore',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_settings_outlet_id_key"
  ON "attendance_settings"("outlet_id");

CREATE INDEX "attendance_settings_company_id_outlet_id_idx"
  ON "attendance_settings"("company_id", "outlet_id");

CREATE TABLE "attendance_sessions" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'CLOCKED_IN',
  "approval_status" "AttendanceApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "clock_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clock_out_at" TIMESTAMPTZ(6),
  "worked_minutes" INTEGER,
  "clock_in_device_label" VARCHAR(160),
  "clock_out_device_label" VARCHAR(160),
  "clock_in_ip_address" VARCHAR(80),
  "clock_out_ip_address" VARCHAR(80),
  "clock_in_note" VARCHAR(500),
  "clock_out_note" VARCHAR(500),
  "review_reason" VARCHAR(500),
  "approved_by_user_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_sessions_company_id_outlet_id_created_at_idx"
  ON "attendance_sessions"("company_id", "outlet_id", "created_at" DESC);

CREATE INDEX "attendance_sessions_outlet_id_user_id_status_clock_in_at_idx"
  ON "attendance_sessions"("outlet_id", "user_id", "status", "clock_in_at" DESC);

CREATE INDEX "attendance_sessions_outlet_id_approval_status_clock_in_at_idx"
  ON "attendance_sessions"("outlet_id", "approval_status", "clock_in_at" DESC);

CREATE TABLE "attendance_photos" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "attendance_session_id" UUID NOT NULL,
  "type" "AttendancePhotoType" NOT NULL,
  "photo_url" TEXT NOT NULL,
  "uploaded_by_user_id" UUID,
  "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_photos_attendance_session_id_type_created_at_idx"
  ON "attendance_photos"("attendance_session_id", "type", "created_at" DESC);

CREATE INDEX "attendance_photos_company_id_outlet_id_type_created_at_idx"
  ON "attendance_photos"("company_id", "outlet_id", "type", "created_at" DESC);

CREATE TABLE "attendance_adjustments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "attendance_session_id" UUID NOT NULL,
  "adjusted_by_user_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "before_json" JSONB,
  "after_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_adjustments_attendance_session_id_created_at_idx"
  ON "attendance_adjustments"("attendance_session_id", "created_at" DESC);

CREATE INDEX "attendance_adjustments_company_id_outlet_id_created_at_idx"
  ON "attendance_adjustments"("company_id", "outlet_id", "created_at" DESC);

ALTER TABLE "attendance_settings"
  ADD CONSTRAINT "attendance_settings_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_settings"
  ADD CONSTRAINT "attendance_settings_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_settings"
  ADD CONSTRAINT "attendance_settings_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_photos"
  ADD CONSTRAINT "attendance_photos_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_photos"
  ADD CONSTRAINT "attendance_photos_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_photos"
  ADD CONSTRAINT "attendance_photos_attendance_session_id_fkey"
  FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_photos"
  ADD CONSTRAINT "attendance_photos_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_adjustments"
  ADD CONSTRAINT "attendance_adjustments_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_adjustments"
  ADD CONSTRAINT "attendance_adjustments_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_adjustments"
  ADD CONSTRAINT "attendance_adjustments_attendance_session_id_fkey"
  FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_adjustments"
  ADD CONSTRAINT "attendance_adjustments_adjusted_by_user_id_fkey"
  FOREIGN KEY ("adjusted_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
