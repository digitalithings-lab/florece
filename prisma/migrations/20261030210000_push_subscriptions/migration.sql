-- Avisos push (Web Push) al psicólogo cuando le agendan una cita
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_psychologist_id_idx" ON "push_subscriptions"("psychologist_id");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
