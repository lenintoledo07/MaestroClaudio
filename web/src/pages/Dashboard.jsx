import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AbstractArt from '../components/AbstractArt';
import CourseModal from '../components/CourseModal';
import { api } from '../api/client';

export default function Dashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [evals, setEvals] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [stats, setStats] = useState({ tips: 0, refs: 0, qa: 0 });
  // Desglose por materia: [{course, tips, refs, qa}]
  const [statsByCourse, setStatsByCourse] = useState([]);
  // Evaluations auto-detectadas que esperan aprobación
  const [pendingReview, setPendingReview] = useState([]);

  const loadAll = async () => {
    try {
      const [cs, ms, evs, prev] = await Promise.all([
        api.get('/courses'),
        api.get('/materials?limit=200'),
        api.get('/evaluations/upcoming').catch(() => []),
        api.get('/evaluations/pending-review').catch(() => []),
      ]);
      setPendingReview(prev);
      const activeCourses = cs.filter((c) => c.status !== 'deleted');
      setCourses(activeCourses);
      setMaterials(ms);
      setEvals(evs);

      // /calendar/weekly-status no existe hasta Fase 5. Intentar pero no fallar.
      try {
        const w = await api.get('/calendar/weekly-status', { silent401: true });
        setWeekly(w);
      } catch { /* aún no implementado */ }

      // Stats por curso — un fetch por curso × 3 endpoints. Lo guardamos
      // desglosado para mostrar la fila por materia, y también sumamos al total.
      const tipsBy = await Promise.all(
        activeCourses.map((c) => api.get(`/courses/${c.id}/exam-tips`).catch(() => []))
      );
      const refsBy = await Promise.all(
        activeCourses.map((c) => api.get(`/courses/${c.id}/references`).catch(() => []))
      );
      const qaBy = await Promise.all(
        activeCourses.map((c) => api.get(`/courses/${c.id}/qa`).catch(() => []))
      );
      const breakdown = activeCourses.map((c, i) => ({
        course: c,
        tips: tipsBy[i].length,
        refs: refsBy[i].length,
        qa: qaBy[i].length,
      }));
      setStatsByCourse(breakdown);
      setStats({
        tips: tipsBy.flat().length,
        refs: refsBy.flat().length,
        qa: qaBy.flat().length,
      });
    } catch (e) {
      console.error('dashboard load', e);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const processedCount = useMemo(() => materials.filter((m) => m.status === 'ready').length, [materials]);
  const processingCount = useMemo(
    () => materials.filter((m) => ['pending', 'downloading', 'transcribing', 'extracting'].includes(m.status)).length,
    [materials],
  );
  // % del trabajo en curso ya terminado. Si no hay nada procesándose y sí hay
  // procesados → 100%. Si no hay materiales todavía → null (no mostramos %).
  const loadingPercent = useMemo(() => {
    const denom = processedCount + processingCount;
    if (denom === 0) return null;
    return Math.round((processedCount / denom) * 100);
  }, [processedCount, processingCount]);
  const nextEval = evals[0];

  return (
    <div className="app-shell">
      <Sidebar
        courses={courses}
        processing={processingCount}
        onAddCourse={() => setShowCourseModal(true)}
        onCourseChanged={loadAll}
      />

      <main className="main-content">
        <header className="topbar">
          <h1>Dashboard</h1>
          <span className="text-mono-sm muted">
            {courses.length} materias activas · {materials.length} materiales
          </span>
        </header>

        {pendingReview.length > 0 && (
          <div
            onClick={() => navigate(`/course/${pendingReview[0].course_id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              marginBottom: 18,
              background: 'rgba(129,140,248,0.08)',
              border: '1px solid var(--orange)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 20 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {pendingReview.length} evaluación{pendingReview.length === 1 ? '' : 'es'} detectada{pendingReview.length === 1 ? '' : 's'} en tus clases
              </div>
              <div className="text-small muted">
                Revisalas para aprobar las fechas y recibir recordatorios automáticos
              </div>
            </div>
            <span className="muted">›</span>
          </div>
        )}

        <section className="stat-strip">
          <div className="stat-hero">
            <div className="label">Clases procesadas</div>
            <div className="number">{String(processedCount).padStart(2, '0')}</div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              {processingCount > 0 ? `${processingCount} procesando` : 'al día'}
            </div>
          </div>
          <StatMini label="Exam Tips"   value={stats.tips} to="/signals/exam-tips" loadingPercent={loadingPercent} processing={processingCount} />
          <StatMini label="Referencias" value={stats.refs} to="/signals/references" loadingPercent={loadingPercent} processing={processingCount} />
          <StatMini label="Q&A"         value={stats.qa}   to="/signals/qa" loadingPercent={loadingPercent} processing={processingCount} />
        </section>

        {statsByCourse.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <SectionHeader title="Por materia" />
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <CourseStatsHeader />
              {statsByCourse.map((row) => (
                <CourseStatsRow key={row.course.id} row={row} onNavigate={navigate} />
              ))}
            </div>
          </section>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28, marginTop: 28 }}>
          <div>
            <SectionHeader title="Esta Semana" />
            {weekly.length === 0 ? (
              <div className="card" style={{ color: 'var(--muted)', fontSize: 13 }}>
                Cuando llegue Fase 5 (Calendar sync) este checklist se llena solo con las clases detectadas en tu Google Calendar.
              </div>
            ) : (
              <div className="weekly-grid">
                {weekly.map((w) => <WeekCard key={w.event_id || w.id} item={w} />)}
              </div>
            )}

            <SectionHeader title="Clases procesadas" />
            {materials.filter((m) => m.status === 'ready').length === 0 ? (
              <div className="card" style={{ color: 'var(--muted)', fontSize: 13 }}>
                Aún no hay clases procesadas. Subí una grabación desde el detalle de una materia.
              </div>
            ) : (
              materials
                .filter((m) => m.status === 'ready')
                .map((m, i) => (
                  <ClassCard key={m.id} material={m} index={materials.length - i} onClick={() => navigate(`/class/${m.id}`)} />
                ))
            )}
          </div>

          <aside className="col" style={{ gap: 16 }}>
            {nextEval ? <EvalBanner evaluation={nextEval} /> : <NoEvalCard />}
            <ProgressRing total={materials.length} done={processedCount} />
          </aside>
        </div>
      </main>

      {showCourseModal && (
        <CourseModal
          onClose={() => setShowCourseModal(false)}
          onSaved={() => { setShowCourseModal(false); loadAll(); }}
        />
      )}
    </div>
  );
}

function StatMini({ label, value, to, loadingPercent, processing }) {
  const navigate = useNavigate();
  const interactive = !!to;
  // Sólo mostramos el indicador cuando hay material activo procesándose.
  // Si todo está ready (100%) no aporta información mostrarlo.
  const showProgress = processing > 0 && loadingPercent != null && loadingPercent < 100;
  return (
    <div
      className="stat-mini"
      onClick={interactive ? () => navigate(to) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && navigate(to) : undefined}
      style={interactive ? { cursor: 'pointer' } : undefined}
    >
      <div className="label">{label}</div>
      <div className="number">{String(value).padStart(2, '0')}</div>
      <div className="number-deco">{String(value).padStart(2, '0')}</div>
      {showProgress && <StatMiniProgress percent={loadingPercent} processing={processing} />}
    </div>
  );
}

function StatMiniProgress({ percent, processing }) {
  return (
    <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted)' }}>
      <div className="stat-progress-track">
        <div
          className="stat-progress-fill"
          style={{ width: `${percent}%` }}
        />
        <div className="stat-progress-shimmer" />
      </div>
      <div
        className="text-mono-sm"
        style={{ display: 'flex', justifyContent: 'space-between', letterSpacing: 1 }}
      >
        <span>{percent}% cargado</span>
        <span>{processing} procesando</span>
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      <div className="line" />
    </div>
  );
}

function WeekCard({ item }) {
  const status = item.material_status || 'missing';
  const statusLabel = { missing: 'Sin grabación', partial: 'Procesando', complete: 'Lista' }[status] || '—';
  return (
    <div className="week-card">
      <div className="art-header">
        <AbstractArt courseCode={item.course_code} width={300} height={70} />
      </div>
      <div className="body">
        <div className="when">{item.day_label || item.start_time || '—'}</div>
        <div className="name">{item.event_title || item.module_name}</div>
        <span className={`pill ${status === 'partial' ? 'processing' : status === 'complete' ? 'ready' : 'missing'}`}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function ClassCard({ material, index, onClick }) {
  return (
    <div className="class-card" onClick={onClick}>
      <div className="art-strip">
        <span className="num">{String(index).padStart(2, '0')}</span>
      </div>
      <div className="body">
        <h3 className="topic">{material.filename || 'Clase sin título'}</h3>
        <div className="meta">
          <span>{material.created_at?.slice(0, 10)}</span>
          {material.duration_seconds && <span>· {Math.round(material.duration_seconds / 60)} min</span>}
          <span>· {material.type}</span>
        </div>
        <div className="tags">
          <span className="tag">{material.status}</span>
        </div>
      </div>
    </div>
  );
}

function EvalBanner({ evaluation }) {
  const dueDate = new Date(evaluation.due_date);
  const days = Math.max(0, Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24)));
  return (
    <div className="eval-banner">
      <div className="label">Próximo parcial</div>
      <div className="countdown">{days}<span style={{ fontSize: 18, marginLeft: 8 }}>días</span></div>
      <div className="name">{evaluation.title || evaluation.name}</div>
      <button className="btn btn-primary" style={{ width: '100%' }}>
        Estudiar para este parcial
      </button>
    </div>
  );
}

function NoEvalCard() {
  return (
    <div className="card" style={{ color: 'var(--muted)', fontSize: 13 }}>
      No hay evaluaciones próximas. Agregá una desde el detalle de la materia.
    </div>
  );
}

function CourseStatsHeader() {
  return (
    <div
      className="row"
      style={{
        padding: '10px 16px',
        background: 'var(--bg3)',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: 'var(--muted)',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <span style={{ flex: 1 }}>Materia</span>
      <span style={{ width: 90, textAlign: 'right' }}>Exam tips</span>
      <span style={{ width: 90, textAlign: 'right' }}>Refs</span>
      <span style={{ width: 70, textAlign: 'right' }}>Q&amp;A</span>
    </div>
  );
}

function CourseStatsRow({ row, onNavigate }) {
  const { course, tips, refs, qa } = row;
  const go = (kind) => onNavigate(`/signals/${kind}?course=${course.id}`);
  return (
    <div
      className="row"
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      <span className="row" style={{ flex: 1, gap: 10, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: course.color || 'var(--muted)' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.name}</span>
        {course.code && <span className="text-mono-sm muted">{course.code}</span>}
      </span>
      <CountCell value={tips} disabled={tips === 0} onClick={() => go('exam-tips')} />
      <CountCell value={refs} disabled={refs === 0} onClick={() => go('references')} />
      <CountCell value={qa}   disabled={qa === 0}   onClick={() => go('qa')} width={70} />
    </div>
  );
}

function CountCell({ value, disabled, onClick, width = 90 }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width,
        textAlign: 'right',
        background: 'none',
        border: 0,
        padding: 0,
        color: disabled ? 'var(--muted2)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {String(value).padStart(2, '0')}
    </button>
  );
}

function ProgressRing({ total, done }) {
  const pct = total > 0 ? done / total : 0;
  const r = 50;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="text-mono-sm muted" style={{ marginBottom: 12 }}>PROGRESO TOTAL</div>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--bg3)" strokeWidth="6" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke="var(--orange)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="78" textAnchor="middle" fontFamily="Bebas Neue" fontSize="32" fill="#EFEFEF">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="text-small">{done} / {total} materiales listos</div>
    </div>
  );
}
