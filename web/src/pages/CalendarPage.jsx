import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

// ── Helpers de fecha ───────────────────────────────────────────────────────

function mondayOf(dateInput) {
  const d = new Date(dateInput);
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonth(cursor) {
  return new Date(cursor.getFullYear(), cursor.getMonth(), 1);
}

function lastDayOfMonth(cursor) {
  return new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
}

// Genera 42 días (6 semanas) desde el lunes anterior al 1er día del mes
function monthGridDays(cursor) {
  const start = mondayOf(firstDayOfMonth(cursor));
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatMonthYear(d) {
  const s = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function weekRangeLabel(monday) {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return `${fmt(monday)} — ${fmt(sunday)}`;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ── Page ───────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [view, setView] = useState('month'); // 'month' | 'list'
  const [cursorMonth, setCursorMonth] = useState(() => firstDayOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD o null

  const load = useCallback(async () => {
    try {
      const [cs, events] = await Promise.all([
        api.get('/courses'),
        // Ventana grande para cubrir 1 mes + buffer
        api.get('/calendar/events?days=60&past_days=30').catch(() => []),
      ]);
      setCourses(cs.filter((c) => c.status !== 'deleted'));
      setGroups(events);
    } catch (e) {
      console.warn('calendar load', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lista plana con info de curso embebida
  const flatEvents = useMemo(() => groups.flatMap((g) => g.events.map((ev) => ({
    ...ev,
    course_id: g.course_id,
    course_name: g.course_name,
    course_code: g.course_code,
    course_color: g.course_color,
  }))), [groups]);

  // Index por día (YYYY-MM-DD) para lookup O(1) en la grilla
  const eventsByDay = useMemo(() => {
    const m = new Map();
    for (const ev of flatEvents) {
      const k = ev.event_date.slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(ev);
    }
    return m;
  }, [flatEvents]);

  // Agrupado por semana (para vista lista)
  const byWeek = useMemo(() => {
    const m = new Map();
    for (const ev of flatEvents) {
      const mon = mondayOf(ev.event_date);
      const k = mon.getTime();
      if (!m.has(k)) m.set(k, { key: k, monday: mon, events: [] });
      m.get(k).events.push(ev);
    }
    return [...m.values()].sort((a, b) => a.monday - b.monday);
  }, [flatEvents]);

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

  const openEvent = (ev) => {
    if (ev.material_id) navigate(`/class/${ev.material_id}`);
  };

  const monthDays = useMemo(() => monthGridDays(cursorMonth), [cursorMonth]);
  const today = isoDay(new Date());
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

  return (
    <div className="app-shell">
      <Sidebar courses={courses} />
      <main className="main-content">
        <header className="topbar">
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <h1 style={{ margin: 0 }}>Calendario</h1>
            <div className="cal-view-toggle">
              <button
                className={view === 'month' ? 'active' : ''}
                onClick={() => setView('month')}
              >
                Mes
              </button>
              <button
                className={view === 'list' ? 'active' : ''}
                onClick={() => setView('list')}
              >
                Lista
              </button>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={sync} disabled={syncing}>
            {syncing ? '⟳ Sincronizando…' : '↻ Sync con Google Calendar'}
          </button>
        </header>

        {syncMsg && <p style={{ fontSize: 13, marginBottom: 16 }}>{syncMsg}</p>}

        {view === 'month' && (
          <MonthView
            cursorMonth={cursorMonth}
            setCursorMonth={setCursorMonth}
            monthDays={monthDays}
            eventsByDay={eventsByDay}
            today={today}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            onOpenEvent={openEvent}
            selectedEvents={selectedEvents}
          />
        )}

        {view === 'list' && (
          <ListView
            byWeek={byWeek}
            onOpenEvent={openEvent}
          />
        )}
      </main>
    </div>
  );
}

// ── Month view ─────────────────────────────────────────────────────────────

function MonthView({
  cursorMonth, setCursorMonth, monthDays, eventsByDay,
  today, selectedDay, setSelectedDay, onOpenEvent, selectedEvents,
}) {
  const monthLabel = formatMonthYear(cursorMonth);
  const goPrev = () => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1));
  const goNext = () => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1));
  const goToday = () => {
    setCursorMonth(firstDayOfMonth(new Date()));
    setSelectedDay(today);
  };

  return (
    <>
      <div className="cal-month-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <button className="cal-nav-btn" onClick={goPrev} aria-label="Mes anterior">‹</button>
          <button className="cal-nav-btn" onClick={goToday}>Hoy</button>
          <button className="cal-nav-btn" onClick={goNext} aria-label="Mes siguiente">›</button>
        </div>
        <h2 className="cal-month-title">{monthLabel}</h2>
        <div className="cal-legend">
          <span className="cal-legend-item"><span className="dot" style={{ background: 'var(--qa)' }} /> Lista</span>
          <span className="cal-legend-item"><span className="dot" style={{ background: 'var(--tip)' }} /> Procesando</span>
          <span className="cal-legend-item"><span className="dot" style={{ background: 'var(--pending)' }} /> Sin grabación</span>
        </div>
      </div>

      <div className="cal-grid">
        {DAY_LABELS.map((l) => (
          <div key={l} className="cal-day-header">{l}</div>
        ))}
        {monthDays.map((d) => {
          const iso = isoDay(d);
          const events = eventsByDay.get(iso) || [];
          const inMonth = d.getMonth() === cursorMonth.getMonth();
          const isToday = iso === today;
          const isSelected = iso === selectedDay;
          return (
            <div
              key={iso}
              className={`cal-day ${inMonth ? '' : 'out'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedDay(iso === selectedDay ? null : iso)}
            >
              <div className="cal-day-num">{d.getDate()}</div>
              <div className="cal-day-events">
                {events.slice(0, 3).map((ev) => (
                  <div
                    key={ev.event_id}
                    className="cal-chip"
                    style={{
                      background: `${ev.course_color || '#818CF8'}26`,
                      borderLeft: `3px solid ${ev.course_color || '#818CF8'}`,
                    }}
                    onClick={(e) => { e.stopPropagation(); onOpenEvent(ev); }}
                    title={ev.title}
                  >
                    {ev.start_time && (
                      <span className="cal-chip-time">{String(ev.start_time).slice(0, 5)}</span>
                    )}
                    <span className="cal-chip-title">{ev.title}</span>
                  </div>
                ))}
                {events.length > 3 && (
                  <div className="cal-more">+{events.length - 3} más</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="cal-day-detail">
          <div className="spread" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {new Date(selectedDay).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <button className="btn btn-ghost" onClick={() => setSelectedDay(null)} style={{ padding: '4px 10px' }}>
              Cerrar
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="muted">Sin clases este día.</p>
          ) : (
            selectedEvents.map((ev) => (
              <EventRow key={ev.event_id} ev={ev} onOpen={() => onOpenEvent(ev)} />
            ))
          )}
        </div>
      )}
    </>
  );
}

// ── List view (la que ya teníamos) ──────────────────────────────────────────

function ListView({ byWeek, onOpenEvent }) {
  if (byWeek.length === 0) {
    return (
      <div className="card" style={{ color: 'var(--muted)' }}>
        No hay clases detectadas. Hacé "Sync con Google Calendar" o agregá un
        alias en la materia si tu evento no se asocia automáticamente.
      </div>
    );
  }
  return byWeek.map((week) => (
    <div key={week.key} style={{ marginBottom: 28 }}>
      <div className="section-header">
        <h2>{weekRangeLabel(week.monday)}</h2>
        <div className="line" />
        <span className="text-mono-sm muted">{week.events.length} clases</span>
      </div>
      {week.events.map((ev) => (
        <EventRow key={ev.event_id} ev={ev} onOpen={() => onOpenEvent(ev)} />
      ))}
    </div>
  ));
}

function EventRow({ ev, onOpen }) {
  return (
    <div
      className="card card-compact"
      style={{
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: ev.material_id ? 'pointer' : 'default',
      }}
      onClick={onOpen}
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
  );
}
