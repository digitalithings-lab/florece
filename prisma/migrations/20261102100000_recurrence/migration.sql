-- AlterTable
ALTER TABLE "appointments"
  ADD COLUMN "recurrence_group_id" UUID,
  ADD COLUMN "recurrence_rule" TEXT,
  ADD COLUMN "recurrence_index" INTEGER;

-- CreateIndex
CREATE INDEX "appointments_recurrence_group_id_idx" ON "appointments"("recurrence_group_id");
