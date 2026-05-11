import { useEffect, useRef, useState } from 'react';
import { api, BASE } from '../api/client';

const STAGES = [
  { key: 'pending',      label: 'En cola' },
  { key: 'downloading',  label: 'Descargando' },
  { key: 'transcribing', label: 'Transcribiendo' },
  { key: 'extracting',   label: 'Extrayendo señales' },
  { key: 'ready',        label: 'Listo' },
];

const PROGRESS = { pending: 5, downloading: 25, transcribing: 55, extracting: 80, ready: 100, error: 0 };

export default function MaterialUploader({ moduleId, onDone }) {
  const [materialId, setMaterialId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [batchMsg, setBatchMsg] = useState(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // SSE de status
  useEffect(() => {
    if (!materialId) return undefined;
    const es = new EventSource(`${BASE}/materials/${materialId}/status`, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setStatus(data.status);
        if (data.status === 'ready' || data.status === 'error') {
          es.close();
          if (data.status === 'ready') onDone?.(materialId);
          if (data.status === 'error') setError(data.error_message || 'Error procesando');
        }
      } catch {/* ignore */}
    };
    es.onerror = () => { es.close(); };
    return () => es.close();
  }, [materialId, onDone]);

  const submitDrive = async () => {
    if (!driveUrl.trim()) return;
    setBusy(true); setError(null); setBatchMsg(null);
    try {
      const r = await api.post(`/modules/${moduleId}/materials/drive`, { drive_url: driveUrl.trim() });
      setMaterialId(r.material_id);
      setStatus(r.status || 'pending');
      setDriveUrl('');
      if (r.batch && r.batch.length > 1) {
        // Import de carpeta: mostramos el resumen y dejamos el SSE seguir
        // al primer material (los demás procesan en background).
        setBatchMsg(r.message);
      }
    } catch (e) {
      setError(e.body?.detail || `Error ${e.status}`);
    } finally {
      setBusy(false);
    }
  };

  const submitFile = async (file) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch(`${BASE}/modules/${moduleId}/materials/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const r = await resp.json();
      setMaterialId(r.material_id);
      setStatus(r.status || 'pending');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) submitFile(f);
  };

  const progress = status ? (PROGRESS[status] ?? 0) : 0;

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="field">
        <label>URL de Google Drive (archivo o carpeta)</label>
        <div className="row">
          <input
            type="text"
            placeholder="https://drive.google.com/... (archivo o carpeta)"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            disabled={busy || !!materialId}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" disabled={busy || !driveUrl || !!materialId} onClick={submitDrive}>
            Procesar
          </button>
        </div>
      </div>

      <div
        className={`dropzone${dragOver ? ' dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          type="file"
          ref={fileRef}
          accept=".txt"
          style={{ display: 'none' }}
          onChange={(e) => submitFile(e.target.files?.[0])}
        />
        <div className="text-display" style={{ fontSize: 20, color: 'var(--text)' }}>
          Arrastrá un export .txt de WhatsApp
        </div>
        <div className="text-small" style={{ marginTop: 8 }}>o hacé click para seleccionar</div>
      </div>

      {batchMsg && (
        <div className="card card-compact" style={{ borderColor: 'var(--orange)' }}>
          <p className="text-small" style={{ margin: 0 }}>
            ✓ {batchMsg}. El primero se muestra abajo en vivo; los demás procesan en background.
          </p>
        </div>
      )}

      {materialId && (
        <div className="card card-compact">
          <div className="spread" style={{ marginBottom: 8 }}>
            <span className="text-mono-sm">Procesando</span>
            <span className="text-small">{status}</span>
          </div>
          <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 999 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--orange)', borderRadius: 999, transition: 'width 0.4s ease' }} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, gap: 4 }}>
            {STAGES.map((s) => (
              <span
                key={s.key}
                className="text-small"
                style={{ color: STAGES.findIndex((x) => x.key === status) >= STAGES.findIndex((x) => x.key === s.key) ? 'var(--text)' : 'var(--muted2)' }}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
