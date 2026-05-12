-- 004 — Auto-detected evaluations
-- Cuando el LLM extrae signals de un transcript y encuentra un pendiente con
-- tipo='evaluacion' + fecha_mencionada válida, crea una fila en evaluations
-- con auto_detected=TRUE y approved IS NULL. El usuario aprueba/rechaza desde
-- la UI. El scheduler de recordatorios y el endpoint /upcoming filtran las
-- pending-review para no notificar antes de que el usuario las valide.

ALTER TABLE evaluations
    ADD COLUMN IF NOT EXISTS auto_detected      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS source_material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved           BOOLEAN;

-- approved IS NULL → pendiente revisión (sólo aplica a auto_detected=TRUE)
-- approved = TRUE  → validada por el usuario (default semántico para creadas a mano)
-- approved = FALSE → rechazada (en práctica las borramos)

-- Las filas existentes (creadas a mano) deben quedar como aprobadas.
UPDATE evaluations SET approved = TRUE WHERE approved IS NULL AND auto_detected = FALSE;

-- Index parcial para listar rápido las pending-review por materia.
CREATE INDEX IF NOT EXISTS evaluations_pending_review_idx
    ON evaluations(course_id)
    WHERE auto_detected = TRUE AND approved IS NULL;
