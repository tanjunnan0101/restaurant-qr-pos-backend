CREATE TYPE "AttendanceShiftStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "attendance_shifts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "outlet_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "AttendanceShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
  "title" VARCHAR(120) NOT NULL,
  "station_label" VARCHAR(160),
  "note" VARCHAR(500),
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "created_by_user_id" UUID,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_shifts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attendance_sessions"
ADD COLUMN "scheduled_shift_id" UUID;

CREATE INDEX "attendance_shifts_company_id_outlet_id_starts_at_idx"
  ON "attendance_shifts" ("company_id", "outlet_id", "starts_at");

CREATE INDEX "attendance_shifts_outlet_id_user_id_starts_at_idx"
  ON "attendance_shifts" ("outlet_id", "user_id", "starts_at");

CREATE INDEX "attendance_shifts_outlet_id_status_starts_at_idx"
  ON "attendance_shifts" ("outlet_id", "status", "starts_at");

CREATE INDEX "attendance_sessions_scheduled_shift_id_idx"
  ON "attendance_sessions" ("scheduled_shift_id");

ALTER TABLE "attendance_shifts"
ADD CONSTRAINT "attendance_shifts_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_shifts"
ADD CONSTRAINT "attendance_shifts_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_shifts"
ADD CONSTRAINT "attendance_shifts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_shifts"
ADD CONSTRAINT "attendance_shifts_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_shifts"
ADD CONSTRAINT "attendance_shifts_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_sessions"
ADD CONSTRAINT "attendance_sessions_scheduled_shift_id_fkey"
  FOREIGN KEY ("scheduled_shift_id") REFERENCES "attendance_shifts" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
