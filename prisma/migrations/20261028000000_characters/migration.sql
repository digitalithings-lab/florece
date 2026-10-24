-- CreateTable
CREATE TABLE "public"."characters" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "look" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_user_id_key" ON "public"."characters"("user_id");

-- AddForeignKey
ALTER TABLE "public"."characters" ADD CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

