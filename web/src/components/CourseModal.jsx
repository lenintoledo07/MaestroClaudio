import { useEffect, useState } from 'react';
import { api } from '../api/client';

const COLORS = [
  { key: 'indigo',  hex: '#818CF8', name: 'Indigo' },
  { key: 'purple',  hex: '#A78BFA', name: 'Púrpura' },
  { key: 'cyan',    hex: '#67E8F9', name: 'Cyan' },
  { key: 'green',   hex: '#86EFAC', name: 'Verde' },
  { key: 'amber',   hex: '#F59E0B', name: 'Ámbar' },
  { key: 'pink',    hex: '#F9A8D4', name: 'Rosa' },
  { key: 'blue',    hex: '#93C5FD', name: 'Azul' },
  { key: 'red',     hex: '#FCA5A5', name: 'Rojo' },
];

export default function CourseModal({ course, onClose, onSaved }) {
  const editing = !!course;
  const [form, setForm] = useState({
    name: course?.name || '',
    code: course?.code || '',
    professor_name: course?.professor_name || '',
    color: course?.color || 'indigo',
    drive_folder_id: course?.drive_folder_id || '',
    status: course?.status || 'active',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [driveFolders, setDriveFolders] = useState(null);  // null=loading, []=sin root, [...]=list
  const [driveErr, setDriveErr] = useState(null);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Cargar subfolders del Drive raíz del user (si está configurado).
  // Permite elegir la carpeta de la materia con un dropdown en vez de pegar IDs.
  useEffect(() => {
    api.get('/users/me/drive/folders', { silent401: true })
      .then((folders) => setDriveFolders(folders))
      .catch((e) => {
        if (e.status === 400) {
          // user no tiene drive_folder_id raíz configurado — caemos al input manual
          setDriveFolders([]);
        } else {
          setDriveErr(e.body?.detail || `Error ${e.status}`);
          setDriveFolders([]);
        }
      });
  }, []);

  const submit = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return; }
    setBusy(true); setError(null);
    try {
      if (editing) {
        await api.patch(`/courses/${course.id}`, form);
      } else {
        await api.post('/courses', form);
      }
      onSaved?.();
    } catch (e) {
      setError(e.body?.detail || `Error ${e.status}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? 'Editar materia' : 'Nueva materia'}</h2>

        <div className="field">
          <label>Nombre <span className="error">*</span></label>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Hacking Ético" />
        </div>

        <div className="field">
          <label>Código</label>
          <input value={form.code} onChange={(e) => update('code', e.target.value)} placeholder="HE-01" />
        </div>

        <div className="field">
          <label>Profesor/a</label>
          <input value={form.professor_name} onChange={(e) => update('professor_name', e.target.value)} placeholder="Nombre del docente" />
        </div>

        <div className="field">
          <label>Color</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => update('color', c.key)}
                title={c.name}
                style={{
                  width: 32, height: 32, borderRadius: '50%', background: c.hex,
                  border: form.color === c.key ? '2px solid var(--text)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label>Carpeta de Google Drive</label>
          {driveFolders === null && (
            <span className="text-small">Cargando subcarpetas de tu Drive…</span>
          )}
          {driveFolders && driveFolders.length > 0 ? (
            <>
              <select
                value={form.drive_folder_id}
                onChange={(e) => update('drive_folder_id', e.target.value)}
              >
                <option value="">— Seleccioná una carpeta —</option>
                {driveFolders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
                <option value="__manual__">📝 Pegar ID manualmente…</option>
              </select>
              {form.drive_folder_id === '__manual__' && (
                <input
                  style={{ marginTop: 8 }}
                  value=""
                  onChange={(e) => update('drive_folder_id', e.target.value)}
                  placeholder="Pegá link o ID acá..."
                  autoFocus
                />
              )}
              <span className="text-small">
                Subcarpetas de tu Drive raíz. Si la materia tiene una carpeta fuera de ahí, elegí "Pegar ID manualmente".
              </span>
            </>
          ) : (
            <>
              <input
                value={form.drive_folder_id}
                onChange={(e) => update('drive_folder_id', e.target.value)}
                placeholder="https://drive.google.com/drive/folders/abc123..."
              />
              <span className="text-small">
                Pegá el link completo de la carpeta o el ID.
                {' '}<strong>Tip:</strong> si configurás tu Drive raíz en <em>Ajustes → Carpeta raíz de Google Drive</em>, acá te aparece un dropdown con tus carpetas en vez de pegar IDs.
              </span>
            </>
          )}
          {driveErr && <span className="error text-small">{driveErr}</span>}
        </div>

        {editing && (
          <div className="field">
            <label>Estado</label>
            <select value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="active">Activa</option>
              <option value="paused">Pausada</option>
              <option value="completed">Completada</option>
            </select>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
