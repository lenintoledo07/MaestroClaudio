-- Maestro Claudio · 002 Phase 2 columns
--
-- Agrega columnas necesarias para Fase 2 (pipeline de procesamiento) que
-- decidimos NO retrofitear al schema inicial:
--
--   chunks.embedding_model     → versionado del modelo de embeddings (riesgo #6)
--                                Permite re-indexar selectivamente cuando
--                                cambiemos de text-embedding-3-small a otro
--                                modelo.
--
--   materials.cost_estimated_usd → tracking de costos por material procesado
--                                  (riesgo #4). Suma de Deepgram + Claude +
--                                  ElevenLabs + OpenAI embeddings.
--                                  NULL hasta que el worker termine.
--
-- Idempotente: usa IF NOT EXISTS y DO blocks para columnas.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chunks' AND column_name = 'embedding_model'
    ) THEN
        ALTER TABLE chunks
            ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'materials' AND column_name = 'cost_estimated_usd'
    ) THEN
        ALTER TABLE materials
            ADD COLUMN cost_estimated_usd NUMERIC(10, 4);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS chunks_embedding_model_idx
    ON chunks(embedding_model);
