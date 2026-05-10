import { useState } from 'react';
import { api } from '../api/client';

const COLORS = [
  { key: 'orange',  hex: '#FF4D1C', name: 'Naranja' },
  { key: 'purple',  hex: '#8B5CF6', name: 'Púrpura' },
  { key: 'cyan',    hex: '#06B6D4', name: 'Cyan' },
  { key: 'green',   hex: '#22C55E', name: 'Verde' },
  { key: 'amber',   hex: '#F59E0B', name: 'Ámbar' },
  { key: 'pink',    hex: '#EC4899', name: 'Rosa' },
  { key: 'blue',    hex: '#3B82F6', name: 'Azul' },
  { key: 'red',     hex: '#EF4444', name: 'Rojo' },
];

export default function CourseModal({ course, onClose, onSaved }) {
  const editing = !!course;
  const [form, setForm] = useState({
    name: course?.name || '',
    code: course?.code || '',
    professor_name: course?.professor_name || '',
    color: course?.color || 'orange',
    drive_folder_id: course?.drive_folder_id || '',
    status: course?.status || 'active',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
          <input
            value={form.drive_folder_id}
            onChange={(e) => update('drive_folder_id', e.target.value)}
            placeholder="https://drive.google.com/drive/folders/abc123..."
          />
          <span className="text-small">
            Pegá el link completo de la carpeta (ej. <code>drive.google.com/drive/folders/&lt;id&gt;</code>) o solo el ID.
            Una vez linkeada, vas a ver el botón "☁ Importar de Drive" en el detalle de la materia
            con todos los videos disponibles para procesar.
          </span>
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
