import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

const STEPS = ['Drive', 'Materias', 'Calendario', 'Listo'];

// Paleta cíclica para asignar a las materias creadas automáticamente.
const COLORS = ['#818CF8', '#A78BFA', '#67E8F9', '#86EFAC', '#FCD34D', '#F87171', '#FB923C'];

export default function Onboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Si el user ya tiene drive_folder_id, saltá el paso 1.
  useEffect(() => {
    if (user?.drive_folder_id && step === 0) setStep(1);
  }, [user?.drive_folder_id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const finish = () => {
    // Hard navigate: fuerza re-mount de TODO el tree (incluido ProtectedRoute),
    // que va a hidratar el user state desde /auth/me sin depender de instancias
    // separadas de useAuth (que no comparten state porque no hay Context).
    window.location.assign('/dashboard');
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <Stepper step={step} />
        {step === 0 && <DriveStep onDone={next} />}
        {step === 1 && <CoursesStep onDone={next} />}
        {step === 2 && <CalendarStep onDone={next} />}
        {step === 3 && <DoneStep onFinish={finish} />}
      </div>
    </div>
  );
}

function Stepper({ step }) {
  return (
    <div className="row" style={{ gap: 8, marginBottom: 28, justifyContent: 'center' }}>
      {STEPS.map((label, i) => (
        <div key={label} className="row" style={{ gap: 8, alignItems: 'center' }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 14,
              display: 'grid', placeItems: 'center',
              background: i <= step ? 'var(--orange)' : 'var(--bg3)',
              color: i <= step ? '#fff' : 'var(--muted)',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {i < step ? '✓' : i + 1}
          </div>
          <span className="text-small" style={{ color: i === step ? 'var(--text)' : 'var(--muted)' }}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div style={{ width: 24, height: 1, background: 'var(--border)', marginRight: 8 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Drive ──────────────────────────────────────────────────────────

function DriveStep({ onDone }) {
  const [mode, setMode] = useState('list');  // 'list' o 'manual'
  const [folders, setFolders] = useState(null);
  const [selected, setSelected] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get('/users/me/drive/folders?parent_id=root')
      .then((fs) => setFolders(fs))
      .catch((e) => setError(e?.body?.detail || 'No pude listar tu Drive'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const value = mode === 'list' ? selected : manualInput.trim();
    if (!value) { setError('Elegí una carpeta'); return; }
    setSaving(true); setError(null);
    try {
      await api.patch('/users/me', { drive_folder_id: value });
      onDone();
    } catch (e) {
      setError(e?.body?.detail || `Error ${e?.status || ''}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>Conectá tu carpeta de Drive</h2>
      <p className="text-small muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
        Elegí la carpeta donde tenés organizado tu Master (con subcarpetas por materia).
        Después, cuando crees una materia, podés elegir su subcarpeta de un dropdown.
      </p>

      {mode === 'list' ? (
        <>
          {loading && <p className="muted">Cargando tus carpetas…</p>}
          {!loading && folders && folders.length === 0 && (
            <p className="text-small muted">
              No encontré carpetas top-level en tu Drive.{' '}
              <button style={linkBtn} onClick={() => setMode('manual')}>Pegar link manualmente</button>
            </p>
          )}
          {!loading && folders && folders.length > 0 && (
            <div className="field">
              <label>Carpeta raíz</label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">— Elegí una carpeta —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <button style={{ ...linkBtn, marginTop: 8, fontSize: 13 }} onClick={() => setMode('manual')}>
                ¿No la ves? Pegar link manualmente
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="field">
          <label>Link o ID de la carpeta</label>
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/1ABC..."
          />
          <button style={{ ...linkBtn, marginTop: 8, fontSize: 13 }} onClick={() => setMode('list')}>
            ← Volver a la lista
          </button>
        </div>
      )}

      {error && <p className="error" style={{ marginTop: 12, fontSize: 13 }}>{error}</p>}

      <div className="row" style={{ gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Verificando…' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Materias ──────────────────────────────────────────────────────

function CoursesStep({ onDone }) {
  const [folders, setFolders] = useState(null);
  const [existing, setExisting] = useState(new Set());  // drive_folder_ids ya usados
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({});
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/users/me/drive/folders'),       // subcarpetas de la carpeta raíz
      api.get('/courses').catch(() => []),       // materias que ya existen
    ])
      .then(([fs, cs]) => {
        const usedIds = new Set(cs.filter((c) => c.status !== 'deleted').map((c) => c.drive_folder_id).filter(Boolean));
        setExisting(usedIds);
        setFolders(fs);
        // Default: marcar las que NO existen como materia todavía
        setSelected(Object.fromEntries(fs.map((f) => [f.id, !usedIds.has(f.id)])));
      })
      .catch((e) => setError(e?.body?.detail || 'No pude listar tus subcarpetas'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const createAll = async () => {
    const toCreate = folders.filter((f) => selected[f.id] && !existing.has(f.id));
    setCreating(true);
    let count = 0;
    const errors = [];
    for (let i = 0; i < toCreate.length; i++) {
      const f = toCreate[i];
      try {
        await api.post('/courses', {
          name: f.name,
          drive_folder_id: f.id,
          color: COLORS[i % COLORS.length],
        });
        count++;
      } catch (e) {
        errors.push({ name: f.name, msg: e?.body?.detail || `Error ${e?.status || ''}` });
      }
    }
    setResult({ count, errors });
    setCreating(false);
  };

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>Importá tus materias</h2>
      <p className="text-small muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
        Encontré estas subcarpetas en tu Drive. Cada una se va a crear como una materia
        con su carpeta linkeada. Después podés importar los videos y archivos desde cada materia.
      </p>

      {loading && <p className="muted">Buscando subcarpetas…</p>}
      {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}

      {folders && folders.length === 0 && (
        <p className="text-small muted">
          No encontré subcarpetas dentro de tu carpeta raíz. Podés crear las materias después desde el Dashboard.
        </p>
      )}

      {folders && folders.length > 0 && !result && (
        <div className="col" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {folders.map((f, i) => {
            const isExisting = existing.has(f.id);
            return (
              <label
                key={f.id}
                style={{
                  display: 'flex', gap: 12, alignItems: 'center',
                  padding: '10px 12px',
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: isExisting ? 'default' : 'pointer',
                  opacity: isExisting ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!selected[f.id]}
                  disabled={isExisting}
                  onChange={() => toggle(f.id)}
                />
                <div style={{ width: 10, height: 10, borderRadius: 5, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{f.name}</span>
                {isExisting && <span className="text-small muted">ya existe</span>}
              </label>
            );
          })}
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: 16 }}>
          <p style={{ color: 'var(--orange)', marginBottom: 8 }}>
            ✓ {result.count} {result.count === 1 ? 'materia creada' : 'materias creadas'}
          </p>
          {result.errors.length > 0 && (
            <div className="text-small">
              <p className="error" style={{ marginBottom: 6 }}>{result.errors.length} fallaron:</p>
              <ul style={{ marginLeft: 16 }}>
                {result.errors.map((e, i) => <li key={i}>{e.name}: {e.msg}</li>)}
              </ul>
            </div>
          )}
          <p className="text-small muted" style={{ marginTop: 12 }}>
            Andá a cada materia desde el Dashboard para importar sus videos y archivos.
          </p>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 24, justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onDone}>Saltar por ahora</button>
        {!result ? (
          <button
            className="btn btn-primary"
            onClick={createAll}
            disabled={creating || !folders || selectedCount === 0}
          >
            {creating ? 'Creando…' : `Crear ${selectedCount} ${selectedCount === 1 ? 'materia' : 'materias'}`}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onDone}>Continuar</button>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Calendar ──────────────────────────────────────────────────────

function CalendarStep({ onDone }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sync = async () => {
    setSyncing(true); setError(null);
    try {
      const r = await api.post('/calendar/sync', null);
      setResult(r);
    } catch (e) {
      setError(e?.body?.detail || `Error ${e?.status || ''}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>Conectá tu calendario</h2>
      <p className="text-small muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
        Maestro busca los eventos de tus materias en tu calendario para detectar clases
        y evaluaciones. Podés sincronizar ahora o saltar y hacerlo después desde Ajustes.
      </p>

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Google Calendar</div>
            <div className="text-small muted">Conectado vía tu login de Google</div>
          </div>
          <button className="btn btn-primary" onClick={sync} disabled={syncing}>
            {syncing ? 'Sincronizando…' : (result ? 'Re-sincronizar' : 'Sincronizar ahora')}
          </button>
        </div>
        {result && (
          <p className="text-small" style={{ marginTop: 12, color: 'var(--orange)' }}>
            ✓ Sincronizados {result.synced ?? 0} eventos ({result.new ?? 0} nuevos, {result.updated ?? 0} actualizados)
          </p>
        )}
        {error && <p className="error" style={{ marginTop: 12, fontSize: 13 }}>{error}</p>}
      </div>

      <div className="card" style={{ padding: 16, opacity: 0.55 }}>
        <div className="spread" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Outlook / Office 365</div>
            <div className="text-small muted">Próximamente</div>
          </div>
          <button className="btn btn-ghost" disabled>Conectar</button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 24, justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={onDone}>Saltar por ahora</button>
        <button className="btn btn-primary" onClick={onDone} disabled={!result}>
          Continuar
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Done ──────────────────────────────────────────────────────────

function DoneStep({ onFinish }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 60, height: 60, borderRadius: 30, margin: '0 auto 20px',
        display: 'grid', placeItems: 'center',
        background: 'var(--orange)', color: '#fff', fontSize: 28,
      }}>✓</div>
      <h2 style={{ marginBottom: 8 }}>¡Listo!</h2>
      <p className="text-small muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
        Ya está todo conectado. Para que el chat tenga contexto, andá a cualquier
        materia desde el Dashboard e importá sus videos. El procesamiento corre en
        segundo plano (transcripción + extracción de signals + embeddings).
      </p>
      <button className="btn btn-primary" onClick={onFinish}>
        Ir al Dashboard
      </button>
    </div>
  );
}

const linkBtn = {
  background: 'transparent',
  border: 'none',
  color: 'var(--orange)',
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
};

const styles = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: 32,
  },
};
