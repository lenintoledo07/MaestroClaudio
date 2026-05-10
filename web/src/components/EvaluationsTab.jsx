import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export default function EvaluationsTab({ courseId }) {
  const [evals, setEvals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'parcial', due_date: '' });

  const load = useCallback(async () => {
    const all = await api.get('/evaluations').catch(() => []);
    setEvals(all.filter((e) => e.course_id === courseId));
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

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

      {evals.length === 0 && <p className="muted">Sin evaluaciones registradas.</p>}
      {evals.map((e) => (
        <div key={e.id} className="card card-compact">
          <div className="spread">
            <div>
              <div style={{ fontWeight: 500 }}>{e.title}</div>
              <div className="text-small">{e.kind} · {e.due_date}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => remove(e.id)}>Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  );
}
