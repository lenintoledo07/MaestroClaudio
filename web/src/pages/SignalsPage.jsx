import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import SignalDetail from '../components/SignalDetail';
import { api } from '../api/client';

const KIND_CONFIG = {
  'exam-tips':  { type: 'exam_tip',  title: 'Exam Tips',   icon: '📌', empty: 'Todavía no hay exam tips. Procesá una clase y vas a ver acá los apuntes que el profe marcó como importantes para el parcial.' },
  'references': { type: 'reference', title: 'Referencias', icon: '◇', empty: 'Sin referencias todavía. Aparecen libros, papers, normas y links mencionados en las clases.' },
  'qa':         { type: 'qa',        title: 'Q&A',         icon: '?', empty: 'No hay Q&A todavía. Acá se acumulan las preguntas hechas en clase con su respuesta.' },
};

const IMPORTANCE_COLOR = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#A1A1AA',
};

export default function SignalsPage() {
  const { kind } = useParams();
  const config = KIND_CONFIG[kind];
  const [searchParams, setSearchParams] = useSearchParams();
  // Filtro inicial = ?course=<id> en la URL, sino 'all'. Si el user cambia
  // el filtro lo refleja en la URL para que el link sea compartible.
  const filter = searchParams.get('course') || 'all';
  const setFilter = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('course');
    else params.set('course', next);
    setSearchParams(params, { replace: true });
  };

  const [signals, setSignals] = useState(null);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!config) return;
    setSignals(null);
    api.get(`/signals?type=${config.type}`)
      .then(setSignals)
      .catch((e) => setError(e?.body?.detail || `Error ${e?.status || ''}`));
  }, [config, kind]);

  useEffect(() => {
    api.get('/courses').then((cs) => setCourses(cs.filter((c) => c.status !== 'deleted'))).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    if (!signals) return null;
    const filtered = filter === 'all' ? signals : signals.filter((s) => s.course_id === filter);
    const byCourse = new Map();
    for (const s of filtered) {
      const key = s.course_id;
      if (!byCourse.has(key)) {
        byCourse.set(key, {
          course_id: s.course_id,
          course_name: s.course_name,
          course_code: s.course_code,
          course_color: s.course_color,
          items: [],
        });
      }
      byCourse.get(key).items.push(s);
    }
    return [...byCourse.values()];
  }, [signals, filter]);

  if (!config) {
    return (
      <div className="app-shell">
        <Sidebar courses={courses} />
        <main className="main-content">
          <p className="error">Tipo de signal desconocido: {kind}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar courses={courses} />
      <main className="main-content">
        <header className="topbar">
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 28 }}>{config.icon}</span>
            <h1>{config.title}</h1>
            {signals && (
              <span className="text-mono-sm muted" style={{ marginLeft: 8 }}>
                {signals.length} total
              </span>
            )}
          </div>
          {courses.length > 1 && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, padding: '6px 10px' }}
            >
              <option value="all">Todos los cursos</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </header>

        {error && <p className="error">{error}</p>}
        {signals === null && !error && <p className="muted">Cargando…</p>}

        {grouped && grouped.length === 0 && (
          <div className="card" style={{ marginTop: 20, padding: 24, textAlign: 'center' }}>
            <p className="muted" style={{ lineHeight: 1.6 }}>{config.empty}</p>
          </div>
        )}

        {grouped && grouped.length > 0 && (
          <div className="col" style={{ gap: 24, marginTop: 8 }}>
            {grouped.map((group) => (
              <CourseGroup key={group.course_id} group={group} onOpen={setSelected} kind={kind} />
            ))}
          </div>
        )}
      </main>

      {selected && (
        <SignalDetail signal={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function CourseGroup({ group, onOpen, kind }) {
  // Sub-agrupar por módulo
  const byModule = new Map();
  for (const it of group.items) {
    const key = it.module_id || 'none';
    if (!byModule.has(key)) {
      byModule.set(key, { module_id: it.module_id, module_name: it.module_name, week: it.week_number, items: [] });
    }
    byModule.get(key).items.push(it);
  }
  const modules = [...byModule.values()];

  return (
    <div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: group.course_color || 'var(--muted)' }} />
        <h2 style={{ margin: 0, fontSize: 19 }}>{group.course_name}</h2>
        <span className="text-mono-sm muted">{group.course_code}</span>
        <span className="text-mono-sm muted" style={{ marginLeft: 'auto' }}>{group.items.length}</span>
      </div>
      <div className="col" style={{ gap: 14 }}>
        {modules.map((mod) => (
          <div key={mod.module_id || 'none'} className="card" style={{ padding: 16 }}>
            <div className="text-mono-sm muted" style={{ marginBottom: 10 }}>
              {mod.module_name || '— sin módulo —'}
              {mod.week != null && <span> · semana {mod.week}</span>}
            </div>
            <div className="col" style={{ gap: 8 }}>
              {mod.items.map((s) => (
                <SignalItem key={s.id} signal={s} onOpen={() => onOpen(s)} kind={kind} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalItem({ signal, onOpen, kind }) {
  const showSpeaker = kind === 'qa' && signal.speaker;
  return (
    <div
      onClick={onOpen}
      style={{
        padding: '10px 12px',
        background: 'var(--bg3)',
        borderLeft: `3px solid ${IMPORTANCE_COLOR[signal.importance] || 'var(--muted)'}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg3)'; }}
    >
      <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 15, lineHeight: 1.55 }}>
        {showSpeaker && (
          <span className="text-mono-sm muted" style={{ marginRight: 8 }}>
            [{signal.speaker === 'professor' ? 'PROF' : signal.speaker === 'student' ? 'ALUMNO' : '?'}]
          </span>
        )}
        {signal.content}
      </div>
      {signal.context && (
        <div className="text-small muted" style={{ marginTop: 6, fontStyle: 'italic' }}>
          ↳ {signal.context}
        </div>
      )}
      {signal.timestamp_seconds != null && (
        <div className="text-mono-sm muted" style={{ marginTop: 4, opacity: 0.6 }}>
          {formatTime(signal.timestamp_seconds)} · {signal.material_filename || ''}
        </div>
      )}
    </div>
  );
}

function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
