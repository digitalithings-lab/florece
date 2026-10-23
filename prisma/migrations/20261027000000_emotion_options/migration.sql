-- CreateTable
CREATE TABLE "public"."emotion_options" (
    "id" UUID NOT NULL,
    "psychologist_id" UUID,
    "slug" TEXT,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" CHAR(7) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emotion_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emotion_options_slug_key" ON "public"."emotion_options"("slug");

-- CreateIndex
CREATE INDEX "emotion_options_psychologist_id_active_idx" ON "public"."emotion_options"("psychologist_id", "active");

-- AddForeignKey
ALTER TABLE "public"."emotion_options" ADD CONSTRAINT "emotion_options_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lista por defecto (la misma que tenía la app).
INSERT INTO "public"."emotion_options" ("id", "slug", "label", "emoji", "color", "sort_order") VALUES
    (gen_random_uuid(), 'joy', 'Alegría', '😊', '#F6C453', 0),
    (gen_random_uuid(), 'calm', 'Calma', '😌', '#8CC5A8', 1),
    (gen_random_uuid(), 'gratitude', 'Gratitud', '🙏', '#E9A3B8', 2),
    (gen_random_uuid(), 'sadness', 'Tristeza', '😢', '#7FA7D9', 3),
    (gen_random_uuid(), 'anxiety', 'Ansiedad', '😰', '#B39DDB', 4),
    (gen_random_uuid(), 'anger', 'Enojo', '😠', '#E57A6B', 5),
    (gen_random_uuid(), 'frustration', 'Frustración', '😣', '#F0A36B', 6),
    (gen_random_uuid(), 'tiredness', 'Cansancio', '😴', '#A8A29A', 7),
    (gen_random_uuid(), 'neutral', 'Neutral', '😐', '#CFC8BC', 8);

-- Las columnas nuevas se agregan vacías, se llenan para los registros existentes y luego se vuelven obligatorias.
ALTER TABLE "public"."mood_logs" ADD COLUMN "emotion_color" TEXT,
ADD COLUMN "emotion_emoji" TEXT,
ADD COLUMN "emotion_label" TEXT,
ADD COLUMN "emotion_option_id" UUID,
ALTER COLUMN "emotion" DROP NOT NULL;

UPDATE "public"."mood_logs" AS m
SET "emotion_option_id" = o."id", "emotion_label" = o."label", "emotion_emoji" = o."emoji", "emotion_color" = o."color"
FROM "public"."emotion_options" AS o
WHERE o."slug" = lower(m."emotion"::text);

ALTER TABLE "public"."mood_logs" ALTER COLUMN "emotion_color" SET NOT NULL,
ALTER COLUMN "emotion_emoji" SET NOT NULL,
ALTER COLUMN "emotion_label" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."mood_logs" ADD CONSTRAINT "mood_logs_emotion_option_id_fkey" FOREIGN KEY ("emotion_option_id") REFERENCES "public"."emotion_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
