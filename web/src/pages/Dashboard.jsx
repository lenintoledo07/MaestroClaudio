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

  const loadAll = async () => {
    try {
      const [cs, ms, evs] = await Promise.all([
        api.get('/courses'),
        api.get('/materials?limit=20'),
        api.get('/evaluations/upcoming').catch(() => []),
      ]);
      setCourses(cs.filter((c) => c.status !== 'deleted'));
      setMaterials(ms);
      setEvals(evs);

      // /calendar/weekly-status no existe hasta Fase 5. Intentar pero no fallar.
      try {
        const w = await api.get('/calendar/weekly-status', { silent401: true });
        setWeekly(w);
      } catch { /* aún no implementado */ }

      // Stats agregados — un fetch por curso. Acepto los 4 cursos.
      const tipCounts = await Promise.all(
        cs.map((c) => api.get(`/courses/${c.id}/exam-tips`).catch(() => []))
      );
      const refCounts = await Promise.all(
        cs.map((c) => api.get(`/courses/${c.id}/references`).catch(() => []))
      );
      const qaCounts = await Promise.all(
        cs.map((c) => api.get(`/courses/${c.id}/qa`).catch(() => []))
      );
      setStats({
        tips: tipCounts.flat().length,
        refs: refCounts.flat().length,
        qa: qaCounts.flat().length,
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

        <section className="stat-strip">
          <div className="stat-hero">
            <div className="label">Clases procesadas</div>
            <div className="number">{String(processedCount).padStart(2, '0')}</div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              {processingCount > 0 ? `${processingCount} procesando` : 'al día'}
            </div>
          </div>
          <StatMini label="Exam Tips"   value={stats.tips} to="/signals/exam-tips" />
          <StatMini label="Referencias" value={stats.refs} to="/signals/references" />
          <StatMini label="Q&A"         value={stats.qa}   to="/signals/qa" />
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28 }}>
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

function StatMini({ label, value, to }) {
  const navigate = useNavigate();
  const interactive = !!to;
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
