import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { THEMES, useTheme } from '../hooks/useTheme';

export default function Settings() {
  const { user, logout, refresh } = useAuth();
  const [courses, setCourses] = useState([]);
  const [driveFolder, setDriveFolder] = useState('');
  const [savingDrive, setSavingDrive] = useState(false);
  const [driveMsg, setDriveMsg] = useState(null);

  useEffect(() => {
    api.get('/courses').then((cs) => setCourses(cs.filter((c) => c.status !== 'deleted'))).catch(() => {});
  }, []);

  useEffect(() => {
    setDriveFolder(user?.drive_folder_id || '');
  }, [user?.drive_folder_id]);

  const saveDriveFolder = async () => {
    setSavingDrive(true);
    setDriveMsg(null);
    try {
      const r = await api.patch('/users/me', { drive_folder_id: driveFolder });
      setDriveMsg({ type: 'ok', text: `✅ Conectado a "${r.drive_folder_id ? r.drive_folder_id.slice(0, 12) + '…' : 'desvinculado'}"` });
      refresh?.();
    } catch (e) {
      setDriveMsg({ type: 'error', text: e?.body?.detail || `Error ${e?.status || ''}` });
    } finally {
      setSavingDrive(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar courses={courses} />
      <main className="main-content">
        <header className="topbar"><h1>Ajustes</h1></header>

        <div className="col" style={{ gap: 20, maxWidth: 720 }}>
          <Section title="Cuenta">
            <Row label="Nombre" value={user?.name || '—'} />
            <Row label="Email"  value={user?.email || '—'} />
            <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={logout}>
              Cerrar sesión
            </button>
          </Section>

          <Section title="Carpeta raíz de Google Drive">
            <p className="text-small" style={{ marginBottom: 12 }}>
              Pegá el link o el ID de la carpeta de Drive donde tenés organizado todo tu Master (con subcarpetas por materia: "Hacking Ético", "Normativa", etc).
              Cuando crees una materia, vas a poder elegir su subcarpeta directamente de un dropdown.
            </p>
            <div className="field">
              <label>Link o ID de la carpeta</label>
              <input
                type="text"
                value={driveFolder}
                onChange={(e) => setDriveFolder(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/1ABC..."
              />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={saveDriveFolder}
                disabled={savingDrive}
              >
                {savingDrive ? 'Verificando…' : 'Guardar y verificar'}
              </button>
              {user?.drive_folder_id && (
                <button
                  className="btn btn-ghost"
                  onClick={() => { setDriveFolder(''); }}
                >
                  Limpiar
                </button>
              )}
            </div>
            {driveMsg && (
              <p className={driveMsg.type === 'error' ? 'error' : ''} style={{ marginTop: 12, fontSize: 13 }}>
                {driveMsg.text}
              </p>
            )}
            <p className="text-small" style={{ marginTop: 12 }}>
              Cuando guardes, Maestro verifica que la carpeta exista y sea accesible con los permisos OAuth que diste.
            </p>
          </Section>

          <Section title="Notificaciones — WhatsApp">
            <p className="text-small">
              Configurable cuando completes Meta WhatsApp Cloud API. El número objetivo se setea via env <code>WHATSAPP_MY_NUMBER</code>.
            </p>
          </Section>

          <Section title="Preferencias">
            <Row label="Voz de audio" value="Mateo (eleven_multilingual_v2)" />
          </Section>

          <Section title="Tema visual">
            <p className="text-small" style={{ marginBottom: 16 }}>
              Elegí la paleta que mejor te acompañe. El cambio se aplica al
              instante y persiste en este dispositivo. El icono ◐ arriba a la
              derecha también lo cambia rápido.
            </p>
            <ThemePicker />
          </Section>

          <Section title="MCP Token">
            <p className="text-small">
              Token para conectar Claude.ai como cliente MCP. Lo encontrás en <code>.env.production</code> del VPS.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card">
      <div className="text-mono-sm muted" style={{ marginBottom: 12 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="spread" style={{ padding: '6px 0' }}>
      <span className="text-small">{label}</span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}

function ThemePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      {THEMES.map((t) => {
        const isActive = t.id === theme;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className="col"
            style={{
              alignItems: 'stretch',
              gap: 10,
              padding: 12,
              background: 'var(--bg3)',
              border: `1px solid ${isActive ? 'var(--orange)' : 'var(--border2)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 0.15s, transform 0.1s',
            }}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 4,
              height: 32,
              borderRadius: 6,
              overflow: 'hidden',
            }}>
              {t.swatches.map((s, i) => (
                <span key={i} style={{ background: s }} />
              ))}
            </div>
            <div>
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {t.label}
                {isActive && <span className="text-mono-sm" style={{ color: 'var(--orange)', letterSpacing: 1.5 }}>ACTIVO</span>}
              </div>
              <div className="text-small muted" style={{ marginTop: 4, lineHeight: 1.4 }}>
                {t.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
