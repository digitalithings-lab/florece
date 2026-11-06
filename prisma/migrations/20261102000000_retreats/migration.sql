-- CreateTable
CREATE TABLE "retreats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setting" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'sparkles',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "spots_left" INTEGER NOT NULL DEFAULT 0,
    "total_spots" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2) NOT NULL,
    "deposit" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "tone" TEXT NOT NULL DEFAULT 'leaf',
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retreats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retreats_slug_key" ON "retreats"("slug");

-- CreateIndex
CREATE INDEX "retreats_start_date_idx" ON "retreats"("start_date");
