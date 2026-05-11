import { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { api } from '../api/client';

const STATUS_COLOR = {
  missing: 'var(--pending)',
  partial: 'var(--tip)',
  complete: 'var(--qa)',
};
const STATUS_LABEL = {
  missing: 'Sin grabación',
  partial: 'Procesando',
  complete: 'Lista',
};

export default function CalendarPage() {
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cs, weekly] = await Promise.all([
        api.get('/courses'),
        api.get('/calendar/weekly-status').catch(() => []),
      ]);
      setCourses(cs.filter((c) => c.status !== 'deleted'));
      setGroups(weekly);
    } catch (e) {
      console.warn('calendar load', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api.post('/calendar/sync');
      setSyncMsg(`✅ Sync OK · ${r.synced} eventos · ${r.new} nuevos · ${r.updated} actualizados`);
      await load();
    } catch (e) {
      setSyncMsg(`❌ ${e?.body?.detail || e?.status || 'error'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar courses={courses} />
      <main className="main-content">
        <header className="topbar">
          <h1>Calendario · esta semana</h1>
          <button className="btn btn-ghost" onClick={sync} disabled={syncing}>
            {syncing ? '⟳ Sincronizando…' : '↻ Sync con Google Calendar'}
          </button>
        </header>

        {syncMsg && <p style={{ fontSize: 13, marginBottom: 16 }}>{syncMsg}</p>}

        {groups.length === 0 && (
          <div className="card" style={{ color: 'var(--muted)' }}>
            No hay clases detectadas esta semana. Hacé "Sync con Google Calendar"
            para detectar los eventos cuyos títulos contengan el nombre de tus
            materias.
          </div>
        )}

        {groups.map((g) => (
          <div key={g.course_id} style={{ marginBottom: 24 }}>
            <div className="section-header">
              <h2>{g.course_name}</h2>
              <div className="line" />
              <span className="text-mono-sm muted">{g.course_code || ''}</span>
            </div>
            {g.events.map((ev) => (
              <div key={ev.event_id} className="card card-compact" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_COLOR[ev.material_status] || 'var(--muted)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{ev.title}</div>
                  <div className="text-small">
                    {ev.day_label || ev.event_date} {ev.start_time && `· ${String(ev.start_time).slice(0, 5)}`}
                  </div>
                </div>
                <span className="pill" style={{ background: 'transparent' }}>
                  {STATUS_LABEL[ev.material_status] || ev.material_status}
                </span>
              </div>
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}
