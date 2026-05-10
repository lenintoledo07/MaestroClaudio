import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AbstractArt from '../components/AbstractArt';
import MaterialUploader from '../components/MaterialUploader';
import DriveBrowser from '../components/DriveBrowser';
import ChatInterface from '../components/ChatInterface';
import EvaluationsTab from '../components/EvaluationsTab';
import CourseModal from '../components/CourseModal';
import { api } from '../api/client';

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [allCourses, setAllCourses] = useState([]);
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tab, setTab] = useState('clases');
  const [showUploader, setShowUploader] = useState(false);
  const [showDrive, setShowDrive] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');

  const load = useCallback(async () => {
    const [cs, c, mods, mats] = await Promise.all([
      api.get('/courses'),
      api.get(`/courses/${id}`),
      api.get(`/courses/${id}/modules`).catch(() => []),
      api.get(`/materials?course_id=${id}`).catch(() => []),
    ]);
    setAllCourses(cs.filter((x) => x.status !== 'deleted'));
    setCourse(c);
    setModules(mods);
    setMaterials(mats);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addModule = async () => {
    if (!newModuleName.trim()) return;
    try {
      await api.post(`/courses/${id}/modules`, { name: newModuleName.trim() });
      setNewModuleName('');
      setShowAddModule(false);
      load();
    } catch (e) {
      alert(`Error agregando semana: ${e.status}`);
    }
  };

  if (!course) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  const firstModuleId = modules[0]?.id;

  return (
    <div className="app-shell">
      <Sidebar
        courses={allCourses}
        onAddCourse={() => setShowCourseModal(true)}
        onCourseChanged={load}
      />

      <main className="main-content">
        <header className="topbar">
          <div className="row" style={{ gap: 14 }}>
            <div style={{ width: 48, height: 28, borderRadius: 6, overflow: 'hidden' }}>
              <AbstractArt courseCode={course.code} width={160} height={48} />
            </div>
            <div>
              <h1>{course.name}</h1>
              <div className="text-small">{course.code} {course.professor_name && `· ${course.professor_name}`}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowAddModule((v) => !v)}>+ Semana</button>
            {course.drive_folder_id && (
              <button className="btn btn-ghost" disabled={!firstModuleId} onClick={() => setShowDrive((v) => !v)}>
                ☁ Importar de Drive
              </button>
            )}
            <button className="btn btn-primary" disabled={!firstModuleId} onClick={() => setShowUploader((v) => !v)}>
              ↑ Subir manual
            </button>
          </div>
        </header>

        {showAddModule && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="row">
              <input
                type="text"
                placeholder="Ej: Semana 5 — Criptografía aplicada"
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={addModule}>Crear</button>
            </div>
          </div>
        )}

        {!course.drive_folder_id && (
          <div className="card" style={{ marginBottom: 20, borderColor: 'var(--orange)' }}>
            <p style={{ margin: 0 }}>
              💡 <b>Tip:</b> linkeá una carpeta de Google Drive a esta materia (3 puntitos en el sidebar → Editar → "Carpeta de Drive") y vas a poder importar todos los videos de un click sin pegarlos uno por uno.
            </p>
          </div>
        )}

        {showDrive && firstModuleId && (
          <div style={{ marginBottom: 20 }}>
            <DriveBrowser courseId={id} modules={modules} onImported={() => load()} />
          </div>
        )}

        {showUploader && firstModuleId && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px' }}>Subir material manualmente</h3>
            <p className="text-small" style={{ marginBottom: 12 }}>
              Pegá la URL de un video específico de Drive, o subí un export .txt de WhatsApp.
            </p>
            <div className="field">
              <label>Semana</label>
              <select id="module-select" defaultValue={firstModuleId}>
                {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <MaterialUploader
              moduleId={document.getElementById('module-select')?.value || firstModuleId}
              onDone={() => { setShowUploader(false); load(); }}
            />
          </div>
        )}

        <div className="tabs">
          <div className={`tab ${tab === 'clases' ? 'active' : ''}`}      onClick={() => setTab('clases')}>Clases</div>
          <div className={`tab ${tab === 'chat' ? 'active' : ''}`}        onClick={() => setTab('chat')}>Chat</div>
          <div className={`tab ${tab === 'evaluaciones' ? 'active' : ''}`} onClick={() => setTab('evaluaciones')}>Evaluaciones</div>
        </div>

        {tab === 'clases' && (
          <ClasesTab modules={modules} materials={materials} onClickMaterial={(mid) => navigate(`/class/${mid}`)} />
        )}
        {tab === 'chat' && <ChatInterface courseId={id} />}
        {tab === 'evaluaciones' && <EvaluationsTab courseId={id} />}
      </main>

      {showCourseModal && (
        <CourseModal onClose={() => setShowCourseModal(false)} onSaved={() => { setShowCourseModal(false); load(); }} />
      )}
    </div>
  );
}

function ClasesTab({ modules, materials, onClickMaterial }) {
  if (modules.length === 0) {
    return (
      <div className="card" style={{ color: 'var(--muted)' }}>
        Aún no agregaste ninguna semana. Empezá con "+ Semana" arriba.
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 24 }}>
      {modules.map((m) => {
        const mats = materials.filter((mat) => mat.module_id === m.id);
        return (
          <div key={m.id}>
            <div className="section-header">
              <h2>{m.name}</h2>
              <div className="line" />
              <span className="text-mono-sm muted">{mats.length} mat.</span>
            </div>
            {mats.length === 0 ? (
              <div className="text-small muted" style={{ padding: '8px 4px' }}>
                Sin materiales en esta semana.
              </div>
            ) : (
              mats.map((mat, i) => (
                <div key={mat.id} className="class-card" onClick={() => mat.status === 'ready' && onClickMaterial(mat.id)}>
                  <div className="art-strip">
                    <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="body">
                    <h3 className="topic">{mat.filename || 'Sin título'}</h3>
                    <div className="meta">
                      <span>{mat.created_at?.slice(0, 10)}</span>
                      {mat.duration_seconds && <span>· {Math.round(mat.duration_seconds / 60)} min</span>}
                      <span>· {mat.type}</span>
                    </div>
                    <span className={`pill ${mat.status === 'ready' ? 'ready' : ['pending','downloading','transcribing','extracting'].includes(mat.status) ? 'processing' : 'missing'}`}>
                      {mat.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
