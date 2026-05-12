import { useCallback, useEffect, useState } from 'react';
import { api, BASE } from '../api/client';

/**
 * Navegador de Drive scoped a la carpeta linkeada al curso. Permite entrar a
 * subcarpetas via breadcrumb, ver archivos compatibles (video/pdf/pptx) y
 * elegir uno para importarlo a una semana específica.
 *
 * Props:
 *   courseId      uuid
 *   modules       [{id, name}]  — semanas disponibles para importar
 *   onImported    (materialId) => void
 */
export default function DriveBrowser({ courseId, modules, onImported }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedModule, setSelectedModule] = useState(modules[0]?.id || '');
  const [importing, setImporting] = useState({});
  const [progress, setProgress] = useState({});
  // path = breadcrumb. Vacío = raíz del curso. Cada entry: {id, name}.
  const [path, setPath] = useState([]);

  useEffect(() => {
    if (!selectedModule && modules[0]) setSelectedModule(modules[0].id);
  }, [modules, selectedModule]);

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = currentFolderId
        ? `/courses/${courseId}/drive/files?folder_id=${currentFolderId}`
        : `/courses/${courseId}/drive/files`;
      setItems(await api.get(url));
    } catch (e) {
      setError(e.body?.detail || `Error ${e.status}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, currentFolderId]);

  useEffect(() => { load(); }, [load]);

  const enterFolder = (folder) => {
    setPath((p) => [...p, { id: folder.id, name: folder.name }]);
  };

  const goToBreadcrumb = (index) => {
    // index = -1 vuelve a la raíz; 0..n-1 trunca el path
    setPath((p) => (index < 0 ? [] : p.slice(0, index + 1)));
  };

  const importFile = async (file) => {
    if (!selectedModule) {
      alert('Primero creá una semana para asignar el material.');
      return;
    }
    setImporting((s) => ({ ...s, [file.id]: 'pending' }));
    try {
      const r = await api.post(
        `/modules/${selectedModule}/materials/drive`,
        { drive_file_id: file.id },
      );
      setImporting((s) => ({ ...s, [file.id]: 'ok' }));
      onImported?.(r.material_id);

      const es = new EventSource(`${BASE}/materials/${r.material_id}/status`, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setProgress((s) => ({ ...s, [file.id]: data.status }));
          if (data.status === 'ready' || data.status === 'error') {
            es.close();
            load();
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => es.close();
    } catch (e) {
      setImporting((s) => ({ ...s, [file.id]: 'err' }));
      alert(`No se pudo importar: ${e.body?.detail || e.status}`);
    }
  };

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Archivos en Drive</h3>
          <Breadcrumb path={path} onJump={goToBreadcrumb} />
        </div>
        <button className="btn btn-ghost" onClick={load}>↻ Refrescar</button>
      </div>

      <div className="field">
        <label>Importar a la semana</label>
        <select value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)} disabled={modules.length === 0}>
          {modules.length === 0 && <option value="">— No hay semanas creadas —</option>}
          {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {loading && <p className="muted">Cargando…</p>}
      {error && (
        <>
          <p className="error" style={{ marginBottom: 8 }}>{error}</p>
          <p className="text-small">Editá la materia (los 3 puntitos en el sidebar) y pegá el ID o URL de la carpeta de Drive.</p>
        </>
      )}
      {!loading && !error && items && items.length === 0 && (
        <p className="muted">Esta carpeta está vacía o no contiene archivos compatibles (videos/pdf/pptx).</p>
      )}

      {!loading && items && items.length > 0 && (
        <div className="col" style={{ gap: 6, maxHeight: 480, overflowY: 'auto' }}>
          {items.map((it) => it.is_folder ? (
            <FolderRow key={it.id} folder={it} onEnter={() => enterFolder(it)} />
          ) : (
            <FileRow
              key={it.id}
              file={it}
              state={importing[it.id]}
              stage={progress[it.id]}
              onImport={() => importFile(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Breadcrumb({ path, onJump }) {
  return (
    <div className="text-small" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button className="text-mono-sm" onClick={() => onJump(-1)} style={crumbButtonStyle(path.length === 0)}>
        📁 Carpeta de la materia
      </button>
      {path.map((p, i) => (
        <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="muted">/</span>
          <button onClick={() => onJump(i)} style={crumbButtonStyle(i === path.length - 1)}>
            {p.name}
          </button>
        </span>
      ))}
    </div>
  );
}

function crumbButtonStyle(isCurrent) {
  return {
    background: 'none',
    border: 0,
    padding: '2px 6px',
    borderRadius: 4,
    color: isCurrent ? 'var(--text)' : 'var(--muted)',
    cursor: isCurrent ? 'default' : 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
  };
}

function FolderRow({ folder, onEnter }) {
  return (
    <div
      onClick={onEnter}
      className="row"
      style={{
        padding: '10px 12px',
        background: 'var(--bg3)',
        borderRadius: 8,
        gap: 10,
        cursor: 'pointer',
      }}
    >
      <span style={{ width: 50, fontSize: 18 }}>📁</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{folder.name}</span>
      <span className="text-small muted">carpeta</span>
      <span className="muted" style={{ fontSize: 16 }}>›</span>
    </div>
  );
}

function FileRow({ file, state, stage, onImport }) {
  return (
    <div
      className="row"
      style={{
        padding: '10px 12px',
        background: 'var(--bg3)',
        borderRadius: 8,
        gap: 10,
        opacity: file.already_imported && !state ? 0.55 : 1,
      }}
    >
      <span className="text-mono-sm" style={{ width: 50 }}>{file.type.toUpperCase()}</span>
      <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {file.name}
      </span>
      <span className="text-small" style={{ width: 80, textAlign: 'right' }}>
        {file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : '—'}
      </span>
      {file.already_imported && !state && (
        <span className="pill ready">ya importado</span>
      )}
      {state === 'pending' && stage && stage !== 'ready' && stage !== 'error' && (
        <span className="pill processing">{stage}</span>
      )}
      {stage === 'ready' && <span className="pill ready">listo</span>}
      {(state === 'err' || stage === 'error') && <span className="pill missing">error</span>}
      {!file.already_imported && !state && (
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={onImport}>
          Importar
        </button>
      )}
    </div>
  );
}
