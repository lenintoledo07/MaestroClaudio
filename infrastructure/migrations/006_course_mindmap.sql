-- Migración 004: cache de mapas conceptuales agregados POR CURSO.
-- Equivalente al de materials (003) pero a nivel curso: una vista de
-- todo el material consolidado. Se genera a partir de signals + summaries
-- de los materials del curso.

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS mind_map_markdown TEXT;

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS mind_map_generated_at TIMESTAMPTZ;
