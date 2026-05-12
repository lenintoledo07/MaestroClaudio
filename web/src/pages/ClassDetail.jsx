import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AbstractArt from '../components/AbstractArt';
import ChatInterface from '../components/ChatInterface';
import { api, BASE } from '../api/client';

// markmap-view trae D3 (~600KB). Lazy import para que el bundle inicial
// del SPA no lo cargue: solo se descarga cuando el user entra a la tab Mapa.
const MindMap = lazy(() => import('../components/MindMap'));
const NodeDeepDiveModal = lazy(() => import('../components/NodeDeepDiveModal'));

const TABS = [
  { key: 'tip',     label: 'Tips',       cls: 'signal-tip' },
  { key: 'ref',     label: 'Refs',       cls: 'signal-ref' },
  { key: 'qa',      label: 'Q&A',        cls: 'signal-qa' },
  { key: 'pending', label: 'Pendientes', cls: 'signal-pending' },
  { key: 'mindmap', label: 'Mapa',       cls: 'tab-mindmap' },
];

const SIGNAL_TYPE_BACKEND = {
  tip:     'exam_tip',
  ref:     'reference',
  qa:      'qa',
  pending: 'pending_task',
};

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [allCourses, setAllCourses] = useState([]);
  const [material, setMaterial] = useState(null);
  const [course, setCourse] = useState(null);
  const [module, setModule] = useState(null);
  const [signals, setSignals] = useState([]);
  const [activeTab, setActiveTab] = useState('tip');
  const [mindmap, setMindmap] = useState(null);  // { markdown, cached, generated_at }
  const [mindmapLoading, setMindmapLoading] = useState(false);
  const [mindmapError, setMindmapError] = useState(null);
  const [focusedNode, setFocusedNode] = useState(null);  // texto del nodo doble-clickeado

  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    (async () => {
      const m = await api.get(`/materials/${id}`);
      setMaterial(m);
      const [c, mods, sigs, cs] = await Promise.all([
        api.get(`/courses/${m.course_id}`).catch(() => null),
        api.get(`/courses/${m.course_id}/modules`).catch(() => []),
        api.get(`/modules/${m.module_id}/signals`).catch(() => []),
        api.get('/courses').catch(() => []),
      ]);
      setCourse(c);
      setModule(mods.find((x) => x.id === m.module_id));
      // /modules/{id}/signals devuelve {exam_tip:[...], reference:[...], ...}
      // agrupado por tipo. Aplanamos a array y filtramos por material_id.
      const sigsArray = Array.isArray(sigs) ? sigs : Object.values(sigs || {}).flat();
      setSignals(sigsArray.filter((s) => s.material_id === id));
      setAllCourses(cs.filter((x) => x.status !== 'deleted'));
    })();
  }, [id]);

  // Lazy-load del mindmap al entrar a la tab (evita gastar Claude si nunca se abre).
  useEffect(() => {
    if (activeTab !== 'mindmap' || mindmap || mindmapLoading) return;
    setMindmapLoading(true);
    setMindmapError(null);
    api.get(`/materials/${id}/mindmap`)
      .then(setMindmap)
      .catch((e) => setMindmapError(e?.body?.detail || `Error ${e?.status || ''}`))
      .finally(() => setMindmapLoading(false));
  }, [activeTab, id, mindmap, mindmapLoading]);

  const regenerateMindmap = async () => {
    setMindmapLoading(true);
    setMindmapError(null);
    try {
      const r = await api.post(`/materials/${id}/mindmap/regenerate`);
      setMindmap(r);
    } catch (e) {
      setMindmapError(e?.body?.detail || `Error ${e?.status || ''}`);
    } finally {
      setMindmapLoading(false);
    }
  };

  const audioUrl = `${BASE}/materials/${id}/audio`;
  const filtered = signals.filter((s) => s.type === SIGNAL_TYPE_BACKEND[activeTab]);

  // Waveform decorativo, determinista por id
  const bars = useMemo(() => {
    const seed = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 60 }, (_, i) => 0.2 + 0.7 * Math.abs(Math.sin((i + seed) * 0.7)));
  }, [id]);

  if (!material) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><p className="muted">Cargando…</p></div>;
  }

  const counts = TABS.reduce((acc, t) => ({ ...acc, [t.key]: signals.filter((s) => s.type === SIGNAL_TYPE_BACKEND[t.key]).length }), {});

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  const playProgress = duration ? currentTime / duration : 0;

  return (
    <div className="app-shell">
      <Sidebar courses={allCourses} />
      <main className="main-content">
        <div className="text-small" style={{ marginBottom: 8 }}>
          {course && <span style={{ cursor: 'pointer' }} onClick={() => navigate(`/course/${course.id}`)}>{course.name}</span>}
          {module && <> &gt; {module.name}</>}
        </div>

        <div style={{ height: 70, borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16, position: 'relative' }}>
          <AbstractArt courseCode={course?.code} width={1200} height={70} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 24px' }}>
            <h1 className="text-prose-title" style={{ fontSize: 32, margin: 0, color: 'var(--text)' }}>{material.filename}</h1>
          </div>
        </div>

        <div className="row" style={{ gap: 16, color: 'var(--muted)', fontSize: 12, marginBottom: 18 }}>
          <span>{course?.name}</span>
          <span>·</span>
          <span>{module?.name}</span>
          <span>·</span>
          <span>{material.created_at?.slice(0, 10)}</span>
          {material.duration_seconds && <><span>·</span><span>{Math.round(material.duration_seconds / 60)} min</span></>}
          <span>·</span>
          <span>{material.type}</span>
        </div>

        {material.audio_path && (
          <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
            <button
              onClick={togglePlay}
              style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--orange)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 22, flexShrink: 0,
              }}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
                {bars.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h * 100}%`,
                      background: i / bars.length < playProgress ? 'var(--orange)' : 'var(--border2)',
                      borderRadius: 1,
                      transition: 'background 0.2s ease',
                    }}
                  />
                ))}
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <span className="text-mono-sm">{fmt(currentTime)}</span>
                <span className="text-mono-sm muted">{fmt(duration)}</span>
              </div>
            </div>
            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.target.duration)}
            />
          </div>
        )}

        <div className="tabs">
          {TABS.map((t) => (
            <div key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
              {t.label} {t.key !== 'mindmap' && <span className="text-small">({counts[t.key]})</span>}
            </div>
          ))}
        </div>

        {activeTab === 'mindmap' ? (
          <div>
            {mindmapLoading && !mindmap && (
              <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                <p className="muted">Generando mapa con Claude… (~10-20s)</p>
              </div>
            )}
            {mindmapError && (
              <div className="card" style={{ padding: 20, borderColor: 'var(--pending, #EF4444)' }}>
                <p className="error" style={{ margin: 0 }}>{mindmapError}</p>
                <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => { setMindmap(null); setMindmapError(null); }}>
                  Reintentar
                </button>
              </div>
            )}
            {mindmap && (
              <>
                <Suspense fallback={<p className="muted">Cargando renderer…</p>}>
                  <MindMap
                    markdown={mindmap.markdown}
                    onNodeClick={setFocusedNode}
                    filename={material?.filename ? `${material.filename}.md` : 'mapa-clase.md'}
                  />
                </Suspense>
                <div className="row" style={{ marginTop: 12, gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="text-small muted">
                    {mindmap.cached ? '✓ Cacheado' : '✓ Recién generado'}
                    {mindmap.generated_at && ` · ${new Date(mindmap.generated_at).toLocaleString()}`}
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={regenerateMindmap}
                    disabled={mindmapLoading}
                  >
                    {mindmapLoading ? 'Regenerando…' : '↻ Regenerar'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="col" style={{ gap: 4 }}>
            {filtered.length === 0 && <p className="muted">Sin {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} en esta clase.</p>}
            {filtered.map((s) => (
              <div key={s.id} className={`signal-card ${TABS.find((t) => t.key === activeTab).cls}`}>
                <div className="signal-meta">
                  {s.timestamp_seconds != null && <span className="font-mono">{fmt(s.timestamp_seconds)}</span>}
                  {s.speaker && <span className="tag">{s.speaker}</span>}
                  {s.importance && <span className={`badge badge-${activeTab}`}>{s.importance}</span>}
                </div>
                <div className="signal-content">{s.content}</div>
                {s.context && <div className="text-small" style={{ marginTop: 6 }}>{s.context}</div>}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <h3>Preguntá sobre esta clase</h3>
          <ChatInterface courseId={material.course_id} moduleId={material.module_id} materialId={id} />
        </div>
      </main>

      {focusedNode && (
        <Suspense fallback={null}>
          <NodeDeepDiveModal
            nodeText={focusedNode}
            courseId={material.course_id}
            materialName={material.filename}
            onClose={() => setFocusedNode(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

function fmt(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}
