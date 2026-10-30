-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('APP', 'WEB');

-- Agenda pública del psicólogo
ALTER TABLE "psychologists"
  ADD COLUMN "public_slug" TEXT,
  ADD COLUMN "public_booking_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notify_phone" TEXT;
CREATE UNIQUE INDEX "psychologists_public_slug_key" ON "psychologists"("public_slug");

-- Citas reservadas desde la web, sin cuenta
ALTER TABLE "appointments"
  ALTER COLUMN "patient_id" DROP NOT NULL,
  ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'APP',
  ADD COLUMN "guest_email" TEXT,
  ADD COLUMN "guest_phone" TEXT;
