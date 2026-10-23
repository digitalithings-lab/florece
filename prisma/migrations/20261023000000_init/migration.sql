-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'PSYCHOLOGIST', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."AuthProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "public"."Plan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "public"."FocusArea" AS ENUM ('SELF_ESTEEM', 'ANXIETY', 'EMOTIONAL_REGULATION', 'SELF_CARE', 'RELATIONSHIPS', 'SELF_KNOWLEDGE');

-- CreateEnum
CREATE TYPE "public"."ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'SENSITIVE_DATA', 'AI_PROCESSING', 'COMMUNITY_RULES');

-- CreateEnum
CREATE TYPE "public"."AvatarSpecies" AS ENUM ('BEAR', 'BUNNY', 'FOX', 'CAT', 'CAPYBARA');

-- CreateEnum
CREATE TYPE "public"."ItemCategory" AS ENUM ('CLOTHING', 'ACCESSORY', 'FURNITURE', 'PLANT', 'BACKGROUND', 'DECORATION');

-- CreateEnum
CREATE TYPE "public"."SeedReason" AS ENUM ('CHALLENGE', 'PURCHASE', 'BONUS', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."ChallengeCategory" AS ENUM ('SELF_KNOWLEDGE', 'EMOTIONAL_SKILLS', 'SELF_CARE');

-- CreateEnum
CREATE TYPE "public"."EvidenceType" AS ENUM ('TEXT', 'AUDIO', 'PHOTO', 'INTERACTIVE');

-- CreateEnum
CREATE TYPE "public"."DailyChallengeStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."Emotion" AS ENUM ('JOY', 'CALM', 'GRATITUDE', 'SADNESS', 'ANXIETY', 'ANGER', 'FRUSTRATION', 'TIREDNESS', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "public"."ChatMode" AS ENUM ('SUPPORT', 'SELF_REGULATION');

-- CreateEnum
CREATE TYPE "public"."ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."RiskLevel" AS ENUM ('NONE', 'LOW', 'MODERATE', 'HIGH', 'IMMINENT');

-- CreateEnum
CREATE TYPE "public"."RiskSource" AS ENUM ('CHAT', 'JOURNAL', 'COMMUNITY', 'CALM_BUTTON');

-- CreateEnum
CREATE TYPE "public"."PostStatus" AS ENUM ('VISIBLE', 'PENDING_REVIEW', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "public"."ReactionType" AS ENUM ('HUG', 'SUPPORT', 'CELEBRATE');

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('HARASSMENT', 'SELF_HARM', 'SPAM', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."SlotStatus" AS ENUM ('OPEN', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "public"."AppointmentStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "public"."AppointmentModality" AS ENUM ('VIDEO', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "public"."SubscriptionProvider" AS ENUM ('APPLE', 'GOOGLE', 'REVENUECAT');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'GRACE_PERIOD', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "birth_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "public"."AuthProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_name" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "focus_areas" "public"."FocusArea"[],
    "plan" "public"."Plan" NOT NULL DEFAULT 'FREE',
    "premium_until" TIMESTAMPTZ(6),
    "seeds_balance" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "country_code" CHAR(2),
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "public"."ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "public"."SubscriptionProvider" NOT NULL,
    "product_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."avatars" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "species" "public"."AvatarSpecies" NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "avatars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."items" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "public"."ItemCategory" NOT NULL,
    "price_seeds" INTEGER NOT NULL,
    "premium_only" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."garden_placements" (
    "id" UUID NOT NULL,
    "user_item_id" UUID NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "layer" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "garden_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."seed_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "public"."SeedReason" NOT NULL,
    "reference_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seed_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."challenges" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "public"."ChallengeCategory" NOT NULL,
    "focus_areas" "public"."FocusArea"[],
    "evidence_type" "public"."EvidenceType" NOT NULL,
    "reflection_prompt" TEXT,
    "seeds_reward" INTEGER NOT NULL,
    "duration_minutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "public"."DailyChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ(6),
    "seeds_awarded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."challenge_evidences" (
    "id" UUID NOT NULL,
    "daily_challenge_id" UUID NOT NULL,
    "type" "public"."EvidenceType" NOT NULL,
    "text_content" TEXT,
    "media_key" TEXT,
    "media_duration_sec" INTEGER,
    "reflection" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."journal_prompts" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "focus_area" "public"."FocusArea",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."journal_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "prompt_id" UUID,
    "title" TEXT,
    "content_encrypted" TEXT NOT NULL,
    "theme" TEXT,
    "page_color" TEXT,
    "ai_reflection" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mood_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "emotion" "public"."Emotion" NOT NULL,
    "intensity" SMALLINT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mood_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mode" "public"."ChatMode" NOT NULL DEFAULT 'SUPPORT',
    "title" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "public"."ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "risk_level" "public"."RiskLevel",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "messages_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."risk_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "public"."RiskSource" NOT NULL,
    "source_id" UUID,
    "level" "public"."RiskLevel" NOT NULL,
    "detector" TEXT,
    "action_taken" TEXT,
    "crisis_resources_shown" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."crisis_resources" (
    "id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "url" TEXT,
    "description" TEXT,
    "available_24h" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crisis_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wellbeing_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "helpful_activities" TEXT[],
    "warning_signs" TEXT[],
    "coping_strategies" TEXT[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wellbeing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."support_contacts" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,

    CONSTRAINT "support_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rooms" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."posts" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "content" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."PostStatus" NOT NULL DEFAULT 'VISIBLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."post_reactions" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "public"."ReactionType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reactions_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "public"."reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "reason" "public"."ReportReason" NOT NULL,
    "details" TEXT,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."psychologists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "specialties" TEXT[],
    "bio" TEXT,
    "photo_url" TEXT,
    "session_price_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "session_minutes" INTEGER NOT NULL DEFAULT 50,
    "verified_at" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "psychologists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."availability_slots" (
    "id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "public"."SlotStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "psychologist_id" UUID NOT NULL,
    "slot_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "public"."AppointmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "modality" "public"."AppointmentModality" NOT NULL DEFAULT 'VIDEO',
    "meeting_url" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payment_ref" TEXT,
    "notes_for_psychologist" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shared_summaries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "psychologist_id" UUID,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "shared_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "public"."auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_user_id_key" ON "public"."auth_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "public"."sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "public"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "consents_user_id_type_idx" ON "public"."consents"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_external_id_key" ON "public"."subscriptions"("external_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "public"."subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "avatars_user_id_key" ON "public"."avatars"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_slug_key" ON "public"."items"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_items_user_id_item_id_key" ON "public"."user_items"("user_id", "item_id");

-- CreateIndex
CREATE INDEX "garden_placements_user_item_id_idx" ON "public"."garden_placements"("user_item_id");

-- CreateIndex
CREATE INDEX "seed_transactions_user_id_created_at_idx" ON "public"."seed_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_slug_key" ON "public"."challenges"("slug");

-- CreateIndex
CREATE INDEX "daily_challenges_user_id_date_idx" ON "public"."daily_challenges"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_challenges_user_id_challenge_id_date_key" ON "public"."daily_challenges"("user_id", "challenge_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_evidences_daily_challenge_id_key" ON "public"."challenge_evidences"("daily_challenge_id");

-- CreateIndex
CREATE INDEX "journal_entries_user_id_created_at_idx" ON "public"."journal_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "mood_logs_user_id_date_idx" ON "public"."mood_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "chat_conversations_user_id_started_at_idx" ON "public"."chat_conversations"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "public"."chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_usage_user_id_date_key" ON "public"."chat_usage"("user_id", "date");

-- CreateIndex
CREATE INDEX "risk_events_user_id_created_at_idx" ON "public"."risk_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_events_level_reviewed_at_idx" ON "public"."risk_events"("level", "reviewed_at");

-- CreateIndex
CREATE INDEX "crisis_resources_country_code_active_idx" ON "public"."crisis_resources"("country_code", "active");

-- CreateIndex
CREATE UNIQUE INDEX "wellbeing_plans_user_id_key" ON "public"."wellbeing_plans"("user_id");

-- CreateIndex
CREATE INDEX "support_contacts_plan_id_idx" ON "public"."support_contacts"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_slug_key" ON "public"."rooms"("slug");

-- CreateIndex
CREATE INDEX "posts_room_id_created_at_idx" ON "public"."posts"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "posts_parent_id_idx" ON "public"."posts"("parent_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "public"."reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "psychologists_user_id_key" ON "public"."psychologists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_slots_psychologist_id_starts_at_key" ON "public"."availability_slots"("psychologist_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_slot_id_key" ON "public"."appointments"("slot_id");

-- CreateIndex
CREATE INDEX "appointments_patient_id_starts_at_idx" ON "public"."appointments"("patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_psychologist_id_starts_at_idx" ON "public"."appointments"("psychologist_id", "starts_at");

-- CreateIndex
CREATE INDEX "shared_summaries_user_id_idx" ON "public"."shared_summaries"("user_id");

-- AddForeignKey
ALTER TABLE "public"."auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."avatars" ADD CONSTRAINT "avatars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_items" ADD CONSTRAINT "user_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_items" ADD CONSTRAINT "user_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."garden_placements" ADD CONSTRAINT "garden_placements_user_item_id_fkey" FOREIGN KEY ("user_item_id") REFERENCES "public"."user_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."seed_transactions" ADD CONSTRAINT "seed_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_challenges" ADD CONSTRAINT "daily_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_challenges" ADD CONSTRAINT "daily_challenges_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."challenge_evidences" ADD CONSTRAINT "challenge_evidences_daily_challenge_id_fkey" FOREIGN KEY ("daily_challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."journal_entries" ADD CONSTRAINT "journal_entries_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."journal_prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mood_logs" ADD CONSTRAINT "mood_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_usage" ADD CONSTRAINT "chat_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."risk_events" ADD CONSTRAINT "risk_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."risk_events" ADD CONSTRAINT "risk_events_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wellbeing_plans" ADD CONSTRAINT "wellbeing_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."support_contacts" ADD CONSTRAINT "support_contacts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."wellbeing_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_reactions" ADD CONSTRAINT "post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_reactions" ADD CONSTRAINT "post_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reports" ADD CONSTRAINT "reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."psychologists" ADD CONSTRAINT "psychologists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_slots" ADD CONSTRAINT "availability_slots_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shared_summaries" ADD CONSTRAINT "shared_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shared_summaries" ADD CONSTRAINT "shared_summaries_psychologist_id_fkey" FOREIGN KEY ("psychologist_id") REFERENCES "public"."psychologists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

