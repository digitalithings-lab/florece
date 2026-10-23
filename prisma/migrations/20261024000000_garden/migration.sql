-- DropIndex
DROP INDEX "public"."garden_placements_user_item_id_idx";

-- AlterTable
ALTER TABLE "public"."items" ADD COLUMN     "emoji" TEXT,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "garden_placements_user_item_id_key" ON "public"."garden_placements"("user_item_id");

