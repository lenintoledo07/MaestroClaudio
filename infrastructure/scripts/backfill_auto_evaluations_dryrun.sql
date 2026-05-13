-- Dry-run del backfill: NO inserta nada, solo reporta qué pasaría.
-- Misma lógica que backfill_auto_evaluations.sql pero con SELECT en lugar de INSERT.

\echo '== 1. Estado actual de evaluations auto-detected =='
SELECT
    COUNT(*) AS auto_evaluations_total,
    COUNT(*) FILTER (WHERE approved IS NULL) AS pending_review,
    COUNT(*) FILTER (WHERE approved = TRUE)  AS approved,
    COUNT(*) FILTER (WHERE approved = FALSE) AS rejected
FROM evaluations
WHERE auto_detected = TRUE;

\echo ''
\echo '== 2. Signals candidatas (con patron Tipo: evaluacion + Fecha) =='
SELECT COUNT(*) AS signals_pending_task_con_fecha_evaluacion
FROM signals
WHERE type = 'pending_task'
  AND context LIKE 'Tipo: evaluacion%'
  AND context ~ 'Fecha: \d{4}-\d{2}-\d{2}'
  AND course_id IS NOT NULL;

\echo ''
\echo '== 3. Candidatas que SI se insertarian (post-dedup) =='
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
),
would_insert AS (
    SELECT DISTINCT ON (course_id, due_date)
        course_id, title, due_date::date AS due_date, material_id
    FROM candidates c
    WHERE NOT EXISTS (
        SELECT 1 FROM evaluations e
        WHERE e.course_id = c.course_id
          AND e.due_date BETWEEN c.due_date::date - INTERVAL '2 days'
                              AND c.due_date::date + INTERVAL '2 days'
    )
    ORDER BY course_id, due_date, signal_id
)
SELECT COUNT(*) AS evaluations_que_se_insertarian FROM would_insert;

\echo ''
\echo '== 4. Detalle de las que se insertarian (top 30) =='
WITH candidates AS (
    SELECT
        s.id AS signal_id,
        s.course_id,
        s.material_id,
        LEFT(s.content, 80) AS title,
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
SELECT DISTINCT ON (c.course_id, c.due_date)
    co.name AS curso,
    c.due_date::date AS fecha,
    c.title
FROM candidates c
JOIN courses co ON co.id = c.course_id
WHERE NOT EXISTS (
    SELECT 1 FROM evaluations e
    WHERE e.course_id = c.course_id
      AND e.due_date BETWEEN c.due_date::date - INTERVAL '2 days'
                          AND c.due_date::date + INTERVAL '2 days'
)
ORDER BY c.course_id, c.due_date, c.signal_id
LIMIT 30;

\echo ''
\echo '== 5. Materials que NO tienen signal con patron evaluacion (posibles candidatos LLM re-extract) =='
SELECT COUNT(*) AS materials_ready_sin_signal_evaluacion
FROM materials m
WHERE m.status = 'ready'
  AND NOT EXISTS (
      SELECT 1 FROM signals s
      WHERE s.material_id = m.id
        AND s.type = 'pending_task'
        AND s.context LIKE 'Tipo: evaluacion%'
  );
