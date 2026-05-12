-- 005 — Course aliases para matching de Google Calendar
-- Algunos calendarios externos (ej. ICS de universidades) usan nombres de
-- evento que NO contienen el nombre/código completo de la materia. El sync
-- actual de calendar matchea por substring exact, así que esos eventos
-- quedan sin asociar. Con aliases el user puede listar varios términos
-- alternativos por materia.

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

-- Index GIN para búsqueda eficiente si llegamos a hacer queries con `ANY`
CREATE INDEX IF NOT EXISTS courses_aliases_idx ON courses USING GIN (aliases);
