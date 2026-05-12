-- Migración 003: cache de mapas conceptuales generados por Claude.
-- Cada material puede tener un mapa markdown (formato markmap) generado
-- on-demand desde el transcript + signals destacados. Se cachea acá para
-- evitar regenerar (costo Claude). NULL = nunca generado.

ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS mind_map_markdown TEXT;

ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS mind_map_generated_at TIMESTAMPTZ;
