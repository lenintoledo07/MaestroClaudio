import { useCallback, useEffect, useState } from 'react';
import { api, BASE } from '../api/client';

/**
 * Lista los archivos de la carpeta de Drive linkeada al curso. Para cada
 * video/pdf/pptx muestra un botón para importarlo a una semana específica.
 *
 * Props:
 *   courseId      uuid
 *   modules       [{id, name}]  — semanas disponibles para importar
 *   onImported    (materialId) => void   — refrescar lista del padre
 */
export default function DriveBrowser({ courseId, modules, onImported }) {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedModule, setSelectedModule] = useState(modules[0]?.id || '');
  const [importing, setImporting] = useState({}); // {fileId: 'pending'|'ok'|'err'}
  const [progress, setProgress] = useState({});   // {fileId: 'transcribing'|...}

  useEffect(() => {
    if (!selectedModule && modules[0]) setSelectedModule(modules[0].id);
  }, [modules, selectedModule]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFiles(await api.get(`/courses/${courseId}/drive/files`));
    } catch (e) {
      setError(e.body?.detail || `Error ${e.status}`);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

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

      // Suscribirse al SSE para mostrar progreso
      const es = new EventSource(`${BASE}/materials/${r.material_id}/status`, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setProgress((s) => ({ ...s, [file.id]: data.status }));
          if (data.status === 'ready' || data.status === 'error') {
            es.close();
            load(); // refresca already_imported
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => es.close();
    } catch (e) {
      setImporting((s) => ({ ...s, [file.id]: 'err' }));
      alert(`No se pudo importar: ${e.body?.detail || e.status}`);
    }
  };

  if (loading) return <div className="card"><p className="muted">Cargando carpeta de Drive…</p></div>;

  if (error) {
    return (
      <div className="card">
        <p className="error" style={{ marginBottom: 8 }}>{error}</p>
        <p className="text-small">
          Editá la materia (los 3 puntitos en el sidebar) y pegá el ID o URL de la carpeta de Drive.
        </p>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return <div className="card"><p className="muted">La carpeta está vacía o no contiene archivos compatibles (videos/pdf/pptx).</p></div>;
  }

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Archivos en Drive</h3>
          <p className="text-small" style={{ marginTop: 4 }}>
            {files.length} archivo{files.length !== 1 ? 's' : ''} compatibles. Click en "Importar" para procesar.
          </p>
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

      <div className="col" style={{ gap: 6, maxHeight: 480, overflowY: 'auto' }}>
        {files.map((f) => {
          const state = importing[f.id];
          const stage = progress[f.id];
          return (
            <div
              key={f.id}
              className="row"
              style={{
                padding: '10px 12px',
                background: 'var(--bg3)',
                borderRadius: 8,
                gap: 10,
                opacity: f.already_imported && !state ? 0.55 : 1,
              }}
            >
              <span className="text-mono-sm" style={{ width: 50 }}>{f.type.toUpperCase()}</span>
              <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.name}
              </span>
              <span className="text-small" style={{ width: 80, textAlign: 'right' }}>
                {f.size ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : '—'}
              </span>
              {f.already_imported && !state && (
                <span className="pill ready">ya importado</span>
              )}
              {state === 'pending' && stage && stage !== 'ready' && stage !== 'error' && (
                <span className="pill processing">{stage}</span>
              )}
              {stage === 'ready' && <span className="pill ready">listo</span>}
              {(state === 'err' || stage === 'error') && <span className="pill missing">error</span>}
              {!f.already_imported && !state && (
                <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={() => importFile(f)}>
                  Importar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
