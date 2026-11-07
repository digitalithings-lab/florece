-- Horario real de Nathalie Vera: lunes a sábado de 10:00 a 22:00; domingo cerrado.
-- Solo toca el horario semanal de la agenda pública (slug nathalie-vera); las citas y los bloqueos no se modifican.
DELETE FROM "availability_rules"
WHERE "psychologist_id" IN (SELECT "id" FROM "psychologists" WHERE "public_slug" = 'nathalie-vera');

INSERT INTO "availability_rules" ("id", "psychologist_id", "weekday", "start_minute", "end_minute")
SELECT gen_random_uuid(), p."id", d, 600, 1320
FROM "psychologists" p, generate_series(1, 6) AS d
WHERE p."public_slug" = 'nathalie-vera';
