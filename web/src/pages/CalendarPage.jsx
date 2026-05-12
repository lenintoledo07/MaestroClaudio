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
  const [courseFilter, setCourseFilter] = useState('all'); // course_id o 'all'
  const [evalDetail, setEvalDetail] = useState(null); // evento de tipo evaluation seleccionado

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

  // Lista plana con info de curso embebida + filtro por materia
  const flatEvents = useMemo(() => {
    const all = groups.flatMap((g) => g.events.map((ev) => ({
      ...ev,
      course_id: g.course_id,
      course_name: g.course_name,
      course_code: g.course_code,
      course_color: g.course_color,
    })));
    return courseFilter === 'all' ? all : all.filter((ev) => ev.course_id === courseFilter);
  }, [groups, courseFilter]);

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
    if (ev.kind === 'evaluation') {
      setEvalDetail(ev);
    } else if (ev.material_id) {
      navigate(`/class/${ev.material_id}`);
    }
  };

  const monthDays = useMemo(() => monthGridDays(cursorMonth), [cursorMonth]);
  const today = isoDay(new Date());
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

  return (
    <div className="app-shell">
      <Sidebar courses={courses} />
      <main className="main-content">
        <header className="topbar">
          <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
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
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
              }}
            >
              <option value="all">Todas las materias</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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

      {evalDetail && (
        <EvalDetailModal
          ev={evalDetail}
          onClose={() => setEvalDetail(null)}
          onOpenSource={(mid) => { setEvalDetail(null); navigate(`/class/${mid}`); }}
        />
      )}
    </div>
  );
}

// ── Modal de detalle de evaluación ──────────────────────────────────────────

function EvalDetailModal({ ev, onClose, onOpenSource }) {
  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const due = new Date(ev.event_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - today) / 86400000);
  const daysLabel = diffDays === 0 ? 'hoy mismo'
    : diffDays === 1 ? 'mañana'
    : diffDays > 0 ? `en ${diffDays} días`
    : `hace ${-diffDays} días`;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'grid', placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <span
            className="text-mono-sm"
            style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(129,140,248,0.18)',
              color: 'var(--orange)',
              fontWeight: 600, letterSpacing: 1.5,
            }}
          >
            EVALUACIÓN · {(ev.type || 'exam').toUpperCase()}
          </span>
          <span
            className="text-small"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ev.course_color || 'var(--muted)' }} />
            {ev.course_name}
          </span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              marginLeft: 'auto',
              background: 'transparent', border: 'none',
              color: 'var(--muted)', fontSize: 20, cursor: 'pointer', padding: 4,
            }}
          >×</button>
        </div>

        <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 18, lineHeight: 1.45 }}>
          {ev.title}
        </div>

        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div className="text-mono-sm muted">FECHA</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {due.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div>
            <div className="text-mono-sm muted">CUENTA REGRESIVA</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: diffDays <= 7 ? 'var(--pending)' : 'var(--text)' }}>
              {daysLabel}
            </div>
          </div>
          {ev.weight_pct != null && (
            <div>
              <div className="text-mono-sm muted">PESO</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{ev.weight_pct}%</div>
            </div>
          )}
        </div>

        {ev.source_material_id ? (
          <>
            <div style={{
              padding: 12,
              background: 'var(--bg3)',
              borderRadius: 8,
              borderLeft: '3px solid var(--orange)',
            }}>
              <div className="text-mono-sm muted" style={{ marginBottom: 4 }}>DETECTADA EN CLASE</div>
              <div className="text-small">
                Esta evaluación se mencionó en una clase. Revisar el material te
                da contexto sobre qué entra, qué pidió el profe y los puntos
                clave que vale repasar antes.
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => onOpenSource(ev.source_material_id)}
            >
              Ver clase fuente con puntos clave →
            </button>
          </>
        ) : (
          <div className="text-small muted" style={{ fontStyle: 'italic' }}>
            Sin clase fuente vinculada (evaluación cargada a mano).
          </div>
        )}
      </div>
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
                {events.slice(0, 3).map((ev) => {
                  const isEval = ev.kind === 'evaluation';
                  const color = ev.course_color || '#818CF8';
                  return (
                    <div
                      key={`${ev.kind || 'class'}-${ev.event_id}`}
                      className={`cal-chip${isEval ? ' is-eval' : ''}`}
                      style={{
                        background: isEval ? color : `${color}26`,
                        borderLeft: `3px solid ${color}`,
                        color: isEval ? '#0E0E10' : 'var(--text)',
                      }}
                      onClick={(e) => { e.stopPropagation(); onOpenEvent(ev); }}
                      title={isEval ? `EVALUACIÓN · ${ev.title}` : ev.title}
                    >
                      {isEval ? (
                        <span className="cal-chip-time" style={{ color: '#0E0E10', opacity: 0.7 }}>★</span>
                      ) : ev.start_time && (
                        <span className="cal-chip-time">{String(ev.start_time).slice(0, 5)}</span>
                      )}
                      <span className="cal-chip-title" style={{ color: isEval ? '#0E0E10' : undefined, fontWeight: isEval ? 600 : 400 }}>
                        {ev.title}
                      </span>
                    </div>
                  );
                })}
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
        <EventRow key={`${ev.kind || 'class'}-${ev.event_id}`} ev={ev} onOpen={() => onOpenEvent(ev)} />
      ))}
    </div>
  ));
}

function EventRow({ ev, onOpen }) {
  const isEval = ev.kind === 'evaluation';
  return (
    <div
      className="card card-compact"
      style={{
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: (isEval || ev.material_id) ? 'pointer' : 'default',
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
      {isEval ? (
        <span
          className="text-mono-sm"
          style={{
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(129,140,248,0.18)',
            color: 'var(--orange)',
            fontSize: 9, letterSpacing: 1, fontWeight: 600,
          }}
        >
          EVAL
        </span>
      ) : (
        <span
          style={{
            width: 8, height: 8, borderRadius: 4,
            background: STATUS_COLOR[ev.material_status] || 'var(--muted)',
          }}
        />
      )}
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
      {isEval ? (
        <span className="pill" style={{ background: 'transparent', color: 'var(--orange)' }}>
          {(ev.type || 'exam').toUpperCase()}
        </span>
      ) : (
        <span className="pill" style={{ background: 'transparent' }}>
          {STATUS_LABEL[ev.material_status] || ev.material_status}
        </span>
      )}
    </div>
  );
}
