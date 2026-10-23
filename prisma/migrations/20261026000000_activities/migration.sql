-- CreateEnum
CREATE TYPE "public"."ActivityType" AS ENUM ('BREATHING', 'MEDITATION', 'BODY_SCAN', 'GRATITUDE', 'BUBBLES', 'ZEN_GARDEN', 'CONTENT');

-- CreateEnum
CREATE TYPE "public"."ContentKind" AS ENUM ('READING', 'LINK');

-- AlterEnum
ALTER TYPE "public"."SeedReason" ADD VALUE 'ACTIVITY';

-- AlterTable
ALTER TABLE "public"."items" ADD COLUMN     "purchasable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unlock_key" TEXT;

-- AlterTable
ALTER TABLE "public"."profiles" ADD COLUMN     "water_balance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."user_items" ADD COLUMN     "growth" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "public"."ActivityType" NOT NULL,
    "date" DATE NOT NULL,
    "duration_sec" INTEGER,
    "data_encrypted" TEXT,
    "content_id" UUID,
    "water_earned" INTEGER NOT NULL DEFAULT 0,
    "seeds_earned" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."assigned_content" (
    "id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "public"."ContentKind" NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "assigned_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_user_id_type_date_idx" ON "public"."activity_logs"("user_id", "type", "date");

-- CreateIndex
CREATE INDEX "assigned_content_patient_id_completed_at_idx" ON "public"."assigned_content"("patient_id", "completed_at");

-- AddForeignKey
ALTER TABLE "public"."activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."assigned_content" ADD CONSTRAINT "assigned_content_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."assigned_content" ADD CONSTRAINT "assigned_content_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Las plantas compradas antes de esta versión ya estaban crecidas.
UPDATE "public"."user_items" SET "growth" = 5;
