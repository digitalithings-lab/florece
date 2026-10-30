-- Datos: agenda de la Psic. Nathalie Vera (EspacioVital), copiada de su página de citas de Google Calendar.
-- Citas de 60 min, hora de Panamá. Los minutos cuentan desde las 00:00 (600 = 10:00).
-- Si no existe ese usuario/psicólogo, no hace nada.
DO $$
DECLARE
  target CONSTANT uuid := 'cc1561c2-40ad-4025-8309-d95d48e60bee';
  pid uuid;
BEGIN
  SELECT id INTO pid FROM "psychologists" WHERE id = target OR user_id = target LIMIT 1;
  IF pid IS NULL THEN
    RAISE NOTICE 'Psicóloga % no encontrada: no se cargó la agenda', target;
    RETURN;
  END IF;

  -- El enlace público es único: se libera si otro lo tuviera.
  UPDATE "psychologists" SET public_slug = NULL WHERE public_slug = 'nathalie-vera' AND id <> pid;
  UPDATE "psychologists"
    SET timezone = 'America/Panama', session_minutes = 60, public_slug = 'nathalie-vera', public_booking_enabled = true
    WHERE id = pid;

  DELETE FROM "availability_rules" WHERE psychologist_id = pid;
  INSERT INTO "availability_rules" (id, psychologist_id, weekday, start_minute, end_minute) VALUES
    (gen_random_uuid(), pid, 1, 600, 960),   -- lunes 10:00–16:00
    (gen_random_uuid(), pid, 1, 1020, 1260), -- lunes 17:00–21:00
    (gen_random_uuid(), pid, 2, 840, 1200),  -- martes 14:00–20:00
    (gen_random_uuid(), pid, 2, 1260, 1320), -- martes 21:00–22:00
    (gen_random_uuid(), pid, 3, 600, 1320),  -- miércoles 10:00–22:00
    (gen_random_uuid(), pid, 4, 600, 1320),  -- jueves 10:00–22:00
    (gen_random_uuid(), pid, 5, 600, 1320),  -- viernes 10:00–22:00
    (gen_random_uuid(), pid, 6, 660, 1080);  -- sábado 11:00–18:00
END $$;
