import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export default function EvaluationsTab({ courseId }) {
  const [evals, setEvals] = useState([]);
  const [pendingReview, setPendingReview] = useState([]);
  const [courses, setCourses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'parcial', due_date: '' });
  const [moveOpenFor, setMoveOpenFor] = useState(null); // evaluation id con dropdown abierto

  const load = useCallback(async () => {
    const [all, pending, cs] = await Promise.all([
      api.get('/evaluations').catch(() => []),
      api.get(`/evaluations/pending-review?course_id=${courseId}`).catch(() => []),
      api.get('/courses').catch(() => []),
    ]);
    setEvals(all.filter((e) => e.course_id === courseId));
    setPendingReview(pending);
    setCourses(cs.filter((c) => c.status !== 'deleted'));
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    await api.post(`/evaluations/${id}/approve`, {});
    load();
  };

  const reject = async (id) => {
    await api.post(`/evaluations/${id}/reject`, {});
    load();
  };

  const moveTo = async (id, newCourseId) => {
    await api.post(`/evaluations/${id}/move`, { course_id: newCourseId });
    setMoveOpenFor(null);
    load();
  };

  const create = async () => {
    if (!form.title || !form.due_date) return;
    try {
      await api.post('/evaluations', { ...form, course_id: courseId });
      setForm({ title: '', kind: 'parcial', due_date: '' });
      setShowForm(false);
      load();
    } catch (e) {
      alert(`Error: ${e.body?.detail || e.status}`);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('¿Eliminar esta evaluación?')) return;
    await api.del(`/evaluations/${id}`);
    load();
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="spread">
        <h2 style={{ margin: 0 }}>Evaluaciones</h2>
        <button className="btn btn-ghost" onClick={() => setShowForm((v) => !v)}>+ Nueva</button>
      </div>

      {pendingReview.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
          <div className="text-mono-sm" style={{ marginBottom: 10, letterSpacing: 1.5, color: 'var(--orange)' }}>
            DETECTADAS EN TUS CLASES · {pendingReview.length} para revisar
          </div>
          <div className="col" style={{ gap: 8 }}>
            {pendingReview.map((e) => (
              <div key={e.id} className="col" style={{ gap: 6, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div className="row" style={{ gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{e.title}</div>
                    <div className="text-small muted">{e.due_date}</div>
                  </div>
                  <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => approve(e.id)}>
                    Aprobar
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => setMoveOpenFor(moveOpenFor === e.id ? null : e.id)}
                  >
                    Reasignar
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => reject(e.id)}>
                    Rechazar
                  </button>
                </div>
                {moveOpenFor === e.id && (
                  <MovePicker
                    courses={courses}
                    currentCourseId={e.course_id}
                    onPick={(cid) => moveTo(e.id, cid)}
                    onCancel={() => setMoveOpenFor(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="card">
          <div className="field">
            <label>Título</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Parcial 1" />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="parcial">Parcial</option>
              <option value="final">Final</option>
              <option value="trabajo">Trabajo práctico</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={create}>Crear</button>
        </div>
      )}

      {evals.length === 0 && pendingReview.length === 0 && <p className="muted">Sin evaluaciones registradas.</p>}
      {evals.map((e) => (
        <div key={e.id} className="card card-compact">
          <div className="spread">
            <div>
              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                {e.title}
                {e.auto_detected && (
                  <span className="text-mono-sm" style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(129,140,248,0.15)', color: 'var(--orange)', fontSize: 9, letterSpacing: 1 }}>
                    AUTO
                  </span>
                )}
              </div>
              <div className="text-small">{e.type || e.kind} · {e.due_date}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {e.auto_detected && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setMoveOpenFor(moveOpenFor === e.id ? null : e.id)}
                >
                  Reasignar
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => remove(e.id)}>Eliminar</button>
            </div>
          </div>
          {moveOpenFor === e.id && (
            <div style={{ marginTop: 10 }}>
              <MovePicker
                courses={courses}
                currentCourseId={e.course_id}
                onPick={(cid) => moveTo(e.id, cid)}
                onCancel={() => setMoveOpenFor(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MovePicker({ courses, currentCourseId, onPick, onCancel }) {
  const others = courses.filter((c) => c.id !== currentCourseId);
  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border2)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div className="text-mono-sm muted" style={{ marginBottom: 8, letterSpacing: 1.5 }}>
        MOVER A OTRA MATERIA
      </div>
      <div className="col" style={{ gap: 4 }}>
        {others.length === 0 && (
          <div className="text-small muted">No hay otras materias.</div>
        )}
        {others.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="row"
            style={{
              gap: 10,
              padding: '6px 10px',
              background: 'transparent',
              border: 0,
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || 'var(--muted)' }} />
            <span style={{ flex: 1 }}>{c.name}</span>
            {c.code && <span className="text-mono-sm muted">{c.code}</span>}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
