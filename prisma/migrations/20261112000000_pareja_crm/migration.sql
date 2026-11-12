-- CreateEnum
CREATE TYPE "public"."ClientType" AS ENUM ('INDIVIDUAL', 'COUPLE', 'CHILD');

-- AlterTable
ALTER TABLE "appointments"
  ADD COLUMN "client_type" "public"."ClientType" NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "partner_full_name" TEXT,
  ADD COLUMN "partner_id_number" TEXT,
  ADD COLUMN "partner_birth_date" DATE,
  ADD COLUMN "partner_email" TEXT,
  ADD COLUMN "partner_phone" TEXT,
  ADD COLUMN "crm_group_id" UUID,
  ADD COLUMN "crm_synced_at" TIMESTAMPTZ(6),
  ADD COLUMN "crm_error" TEXT;
