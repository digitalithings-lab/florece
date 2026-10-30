-- CreateEnum
CREATE TYPE "AppointmentCanceller" AS ENUM ('PATIENT', 'PSYCHOLOGIST');

-- AlterTable
ALTER TABLE "appointments"
  ADD COLUMN "patient_full_name" TEXT,
  ADD COLUMN "patient_id_number" TEXT,
  ADD COLUMN "patient_birth_date" DATE,
  ADD COLUMN "cancelled_by" "AppointmentCanceller";

-- Las citas canceladas antes de este cambio: se deduce quién canceló por el texto que se guardaba.
UPDATE "appointments" SET "cancelled_by" = 'PSYCHOLOGIST'
  WHERE "status" = 'CANCELLED' AND "cancel_reason" IS NOT NULL
    AND "cancel_reason" NOT IN ('Cancelada por la persona', 'La persona se desvinculó');
UPDATE "appointments" SET "cancelled_by" = 'PATIENT'
  WHERE "status" = 'CANCELLED' AND "cancel_reason" IN ('Cancelada por la persona', 'La persona se desvinculó');
