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
              Pegá la URL de un archivo de Drive (video/PDF/PPTX) <em>o de una carpeta entera</em> —
              en ese caso se importan todos sus archivos elegibles. También podés subir un export .txt de WhatsApp.
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
          <ClasesTab
            courseId={id}
            modules={modules}
            materials={materials}
            onClickMaterial={(mid) => navigate(`/class/${mid}`)}
            onReload={load}
          />
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

function ClasesTab({ courseId, modules, materials, onClickMaterial, onReload }) {
  const [moveTarget, setMoveTarget] = useState(null);  // { material, modules }

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
                <div
                  key={mat.id}
                  className="class-card"
                  onClick={() => mat.status === 'ready' && onClickMaterial(mat.id)}
                  style={{ overflow: 'visible', position: 'relative' }}
                >
                  <div className="art-strip" style={{ borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)' }}>
                    <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="body" style={{ paddingRight: 48 }}>
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
                  <MaterialActions
                    material={mat}
                    onMove={() => setMoveTarget(mat)}
                    onDeleted={onReload}
                  />
                </div>
              ))
            )}
          </div>
        );
      })}

      {moveTarget && (
        <MoveMaterialDialog
          material={moveTarget}
          modules={modules}
          courseId={courseId}
          onClose={() => setMoveTarget(null)}
          onMoved={() => { setMoveTarget(null); onReload(); }}
        />
      )}
    </div>
  );
}

function MaterialActions({ material, onMove, onDeleted }) {
  const [open, setOpen] = useState(false);
  const stop = (e) => e.stopPropagation();

  const handleDelete = async (e) => {
    stop(e); setOpen(false);
    if (!confirm(`¿Eliminar "${material.filename}" y todo su contenido procesado (signals, chunks, audio)?`)) return;
    try {
      await api.del(`/materials/${material.id}`);
      onDeleted?.();
    } catch (err) {
      alert(`No pude eliminar: ${err?.body?.detail || err?.status}`);
    }
  };

  return (
    <div
      onClick={stop}
      style={{ position: 'absolute', top: 8, right: 8 }}
    >
      <button
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        title="Acciones"
        style={{
          background: 'transparent', border: 'none', color: 'var(--muted)',
          fontSize: 20, cursor: 'pointer', padding: '4px 10px',
          lineHeight: 1, borderRadius: 6,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
      >⋯</button>
      {open && (
        <>
          <div
            onClick={(e) => { stop(e); setOpen(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 4px)',
              background: 'var(--bg3)', border: '1px solid var(--border2)',
              borderRadius: 8, minWidth: 200, zIndex: 11,
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={(e) => { stop(e); setOpen(false); onMove(); }}
              style={menuItem}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >→ Mover a otro módulo</button>
            <button
              onClick={handleDelete}
              style={{ ...menuItem, color: '#EF4444' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >🗑 Eliminar</button>
          </div>
        </>
      )}
    </div>
  );
}

function MoveMaterialDialog({ material, modules, courseId, onClose, onMoved }) {
  const [target, setTarget] = useState(material.module_id || '');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      let destId = target;
      if (target === '__new__') {
        if (!newName.trim()) { setError('Ponele un nombre al módulo'); setBusy(false); return; }
        const next = (modules.reduce((m, x) => Math.max(m, x.week_number || 0), 0) || 0) + 1;
        const created = await api.post(`/courses/${courseId}/modules`, {
          name: newName.trim(),
          week_number: next,
        });
        destId = created.id;
      }
      if (destId === material.module_id) { onClose(); return; }
      await api.patch(`/materials/${material.id}`, { module_id: destId });
      onMoved();
    } catch (e) {
      setError(e?.body?.detail || `Error ${e?.status || ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50,
      display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 460, background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24,
      }}>
        <h3 style={{ marginBottom: 4 }}>Mover material</h3>
        <p className="text-small muted" style={{ marginBottom: 18 }}>
          {material.filename}
        </p>

        {!creating ? (
          <div className="field">
            <label>Módulo destino</label>
            <select
              value={target}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__new__') { setCreating(true); setTarget('__new__'); }
                else setTarget(v);
              }}
              style={{ width: '100%' }}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.id === material.module_id ? ' (actual)' : ''}
                </option>
              ))}
              <option value="__new__">+ Crear módulo nuevo…</option>
            </select>
          </div>
        ) : (
          <div className="field">
            <label>Nombre del módulo nuevo</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Semana 3 — Criptografía"
              autoFocus
            />
            <button
              style={{ background: 'transparent', border: 'none', color: 'var(--orange)', cursor: 'pointer', padding: 0, marginTop: 8, textDecoration: 'underline', fontSize: 13 }}
              onClick={() => { setCreating(false); setTarget(material.module_id || (modules[0]?.id || '')); }}
            >← elegir un módulo existente</button>
          </div>
        )}

        {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  );
}

const menuItem = {
  display: 'block', width: '100%', textAlign: 'left',
  background: 'transparent', border: 'none', color: 'var(--text)',
  padding: '10px 14px', cursor: 'pointer', fontSize: 13,
};
