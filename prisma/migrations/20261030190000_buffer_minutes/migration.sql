-- Descanso configurable entre sesiones (antes eran 10 min fijos para todos)
ALTER TABLE "psychologists" ADD COLUMN "buffer_minutes" INTEGER NOT NULL DEFAULT 10;

-- La Psic. Nathalie Vera agenda cada hora en punto, sin descanso (como en su Google Calendar).
UPDATE "psychologists" SET buffer_minutes = 0
  WHERE id = 'cc1561c2-40ad-4025-8309-d95d48e60bee' OR user_id = 'cc1561c2-40ad-4025-8309-d95d48e60bee';
