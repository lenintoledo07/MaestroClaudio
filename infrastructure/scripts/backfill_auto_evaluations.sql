-- Backfill one-shot: convierte signals tipo 'pending_task' con
-- 'Tipo: evaluacion; Fecha: YYYY-MM-DD' en evaluations auto-detected.
--
-- Por qué: antes del commit que arregla el prompt, el LLM extraía fechas con
-- año desactualizado (e.g. 2025 cuando estamos en 2026). Mi código original
-- de _persist_auto_evaluations descartaba esas fechas por estar en el pasado
-- y no creaba la evaluation. Este script recupera esos datos haciendo bump
-- del año si la fecha original quedó en el pasado.
--
-- Heurística del bump:
--   * Si la fecha del LLM está en el futuro relativo a CURRENT_DATE → usar tal cual.
--   * Si está en el pasado → bump +1 año (asumimos que el profe se refería al próximo).
--
-- Dedup: no insertamos si ya hay otra evaluation en el mismo curso con fecha
-- a menos de 2 días de la candidata (mismo principio que _persist_auto_evaluations).
--
-- Idempotente: re-correrlo es seguro, el NOT EXISTS evita duplicados.

WITH candidates AS (
    SELECT
        s.id AS signal_id,
        s.course_id,
        s.material_id,
        LEFT(s.content, 200) AS title,
        CASE
            WHEN (SUBSTRING(s.context FROM 'Fecha: (\d{4}-\d{2}-\d{2})'))::date >= CURRENT_DATE
                THEN (SUBSTRING(s.context FROM 'Fecha: (\d{4}-\d{2}-\d{2})'))::date
            ELSE (SUBSTRING(s.context FROM 'Fecha: (\d{4}-\d{2}-\d{2})'))::date + INTERVAL '1 year'
        END AS due_date
    FROM signals s
    WHERE s.type = 'pending_task'
      AND s.context LIKE 'Tipo: evaluacion%'
      AND s.context ~ 'Fecha: \d{4}-\d{2}-\d{2}'
      AND s.course_id IS NOT NULL
)
INSERT INTO evaluations (
    course_id, title, type, due_date,
    auto_detected, source_material_id, approved
)
SELECT DISTINCT ON (course_id, due_date)
    course_id, title, 'exam', due_date::date,
    TRUE, material_id, NULL
FROM candidates c
WHERE NOT EXISTS (
    SELECT 1 FROM evaluations e
    WHERE e.course_id = c.course_id
      AND e.due_date BETWEEN c.due_date::date - INTERVAL '2 days'
                          AND c.due_date::date + INTERVAL '2 days'
)
ORDER BY course_id, due_date, signal_id;

-- Reporte
SELECT
    'Backfill OK' AS status,
    COUNT(*) AS auto_evaluations_total,
    COUNT(*) FILTER (WHERE approved IS NULL) AS pending_review,
    COUNT(*) FILTER (WHERE approved = TRUE) AS approved
FROM evaluations
WHERE auto_detected = TRUE;
