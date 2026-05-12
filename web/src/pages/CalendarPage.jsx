import { useCallback, useEffect, useMemo, useState } from 'react';
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

// Devuelve "YYYY-Www" (week number ISO) para agrupar por semana
function weekKey(dateStr) {
  const d = new Date(dateStr);
  const dayNum = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(
    ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function mondayOf(dateStr) {
  const d = new Date(dateStr);
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum);
  return d;
}

function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return `${fmt(monday)} — ${fmt(sunday)}`;
}

export default function CalendarPage() {
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cs, events] = await Promise.all([
        api.get('/courses'),
        api.get('/calendar/events?days=42&past_days=7').catch(() => []),
      ]);
      setCourses(cs.filter((c) => c.status !== 'deleted'));
      setGroups(events);
    } catch (e) {
      console.warn('calendar load', e);
    }
  }, []);

  // Aplanar todos los eventos + agrupar por semana ISO. Cada semana mantiene
  // referencia al curso/color del evento para renderizarlo.
  const byWeek = useMemo(() => {
    const flat = groups.flatMap((g) => g.events.map((ev) => ({
      ...ev,
      course_id: g.course_id,
      course_name: g.course_name,
      course_code: g.course_code,
      course_color: g.course_color,
    })));
    const m = new Map();
    for (const ev of flat) {
      const k = weekKey(ev.event_date);
      if (!m.has(k)) m.set(k, { key: k, monday: mondayOf(ev.event_date), events: [] });
      m.get(k).events.push(ev);
    }
    return [...m.values()].sort((a, b) => a.monday - b.monday);
  }, [groups]);

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
          <h1>Calendario · próximas 6 semanas</h1>
          <button className="btn btn-ghost" onClick={sync} disabled={syncing}>
            {syncing ? '⟳ Sincronizando…' : '↻ Sync con Google Calendar'}
          </button>
        </header>

        {syncMsg && <p style={{ fontSize: 13, marginBottom: 16 }}>{syncMsg}</p>}

        {byWeek.length === 0 && (
          <div className="card" style={{ color: 'var(--muted)' }}>
            No hay clases detectadas en las próximas 6 semanas. Hacé "Sync con
            Google Calendar" para detectar los eventos cuyos títulos contengan
            el nombre de tus materias.
          </div>
        )}

        {byWeek.map((week) => (
          <div key={week.key} style={{ marginBottom: 28 }}>
            <div className="section-header">
              <h2>{formatWeekRange(week.monday)}</h2>
              <div className="line" />
              <span className="text-mono-sm muted">{week.events.length} clases</span>
            </div>
            {week.events.map((ev) => (
              <div
                key={ev.event_id}
                className="card card-compact"
                style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}
              >
                <span
                  style={{
                    width: 4,
                    alignSelf: 'stretch',
                    background: ev.course_color || 'var(--muted)',
                    borderRadius: 2,
                  }}
                />
                <span
                  style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: STATUS_COLOR[ev.material_status] || 'var(--muted)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev.title}
                  </div>
                  <div className="text-small">
                    {ev.day_label || ev.event_date}
                    {ev.start_time && ` · ${String(ev.start_time).slice(0, 5)}`}
                    {ev.course_name && ` · ${ev.course_code || ev.course_name}`}
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
