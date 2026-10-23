-- CreateEnum
CREATE TYPE "public"."CareLinkStatus" AS ENUM ('ACTIVE', 'ENDED');

-- AlterEnum
ALTER TYPE "public"."AppointmentStatus" ADD VALUE 'REQUESTED';

-- AlterEnum
ALTER TYPE "public"."RiskSource" ADD VALUE 'ROUTINE';

-- AlterTable
ALTER TABLE "public"."psychologists" ADD COLUMN     "default_meeting_url" TEXT,
ADD COLUMN     "link_code" TEXT NOT NULL,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City';

-- CreateTable
CREATE TABLE "public"."care_links" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "status" "public"."CareLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "share_routine_progress" BOOLEAN NOT NULL DEFAULT true,
    "auto_challenges_per_day" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "care_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."availability_rules" (
    "id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."availability_blocks" (
    "id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."routines" (
    "id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_type" "public"."EvidenceType" NOT NULL DEFAULT 'TEXT',
    "reflection_prompt" TEXT,
    "weekdays" INTEGER[],
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "seeds_reward" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."routine_completions" (
    "id" UUID NOT NULL,
    "routine_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "text_content" TEXT,
    "reflection" TEXT,
    "risk_level" "public"."RiskLevel",
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_links_patient_id_status_idx" ON "public"."care_links"("patient_id", "status");

-- CreateIndex
CREATE INDEX "care_links_psychologist_id_status_idx" ON "public"."care_links"("psychologist_id", "status");

-- CreateIndex
CREATE INDEX "availability_rules_psychologist_id_idx" ON "public"."availability_rules"("psychologist_id");

-- CreateIndex
CREATE INDEX "availability_blocks_psychologist_id_starts_at_idx" ON "public"."availability_blocks"("psychologist_id", "starts_at");

-- CreateIndex
CREATE INDEX "routines_patient_id_active_idx" ON "public"."routines"("patient_id", "active");

-- CreateIndex
CREATE INDEX "routines_psychologist_id_idx" ON "public"."routines"("psychologist_id");

-- CreateIndex
CREATE UNIQUE INDEX "routine_completions_routine_id_date_key" ON "public"."routine_completions"("routine_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "psychologists_link_code_key" ON "public"."psychologists"("link_code");

-- AddForeignKey
ALTER TABLE "public"."care_links" ADD CONSTRAINT "care_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."care_links" ADD CONSTRAINT "care_links_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_rules" ADD CONSTRAINT "availability_rules_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_blocks" ADD CONSTRAINT "availability_blocks_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routines" ADD CONSTRAINT "routines_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routines" ADD CONSTRAINT "routines_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."routine_completions" ADD CONSTRAINT "routine_completions_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

