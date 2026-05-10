import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

export default function Settings() {
  const { user, logout } = useAuth();
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    api.get('/courses').then((cs) => setCourses(cs.filter((c) => c.status !== 'deleted'))).catch(() => {});
  }, []);

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

          <Section title="Google Drive">
            <p className="text-small">
              Maestro Claudio lee los videos de tus clases desde Drive. Cambiá la carpeta raíz desde el modal de cada materia.
            </p>
          </Section>

          <Section title="Notificaciones — WhatsApp">
            <p className="text-small">
              Configurable cuando lleguemos a Fase 5 (calendar + WhatsApp). El número objetivo se setea via env <code>WHATSAPP_MY_NUMBER</code>.
            </p>
          </Section>

          <Section title="Preferencias">
            <Row label="Voz de audio" value="Mateo (eleven_multilingual_v2)" />
            <Row label="Tema" value="Dark V3 (único disponible)" />
          </Section>

          <Section title="MCP Token">
            <p className="text-small">
              Token para conectar Claude.ai como cliente MCP. Estará disponible cuando lleguemos a Fase 7.
            </p>
            <button className="btn btn-ghost" disabled>Regenerar token</button>
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
