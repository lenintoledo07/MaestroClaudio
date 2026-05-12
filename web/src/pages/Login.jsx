import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import MaestroAvatar from '../components/MaestroAvatar';

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

export default function Login() {
  const { user, loading, login } = useAuth();

  if (loading) {
    return (
      <div style={styles.center}>
        <p className="muted">Verificando sesión…</p>
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div style={styles.page}>
      <div className="login-layout" style={styles.layout}>
        <div className="login-hero" style={styles.heroSide}>
          <MaestroAvatar size={280} />
        </div>
        <div style={styles.card}>
          <div className="logo" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <MaestroAvatar size={42} />
            <div>
              <div className="text-display" style={{ fontSize: 30 }}>Maestro Claudio</div>
              <div className="text-mono-sm" style={{ color: 'var(--muted)' }}>v0.1 · Master Cyber</div>
            </div>
          </div>

          <p style={{ color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
            Tu agente de estudio personal. Procesa grabaciones, extrae exam-tips, te
            recuerda evaluaciones y responde preguntas con base en tu propio material.
          </p>

          <button className="btn" style={styles.googleBtn} onClick={login}>
            {GOOGLE_ICON}
            <span>Continuar con Google</span>
          </button>

          <p className="text-small" style={{ marginTop: 24 }}>
            Al continuar autorizás acceso a Google Drive y Calendar (solo lectura)
            para detectar tus clases y materiales.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
  },
  center: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 420px)',
    gap: 48,
    width: '100%',
    maxWidth: 920,
    alignItems: 'center',
  },
  heroSide: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: 32,
  },
  googleBtn: {
    background: '#fff',
    color: '#202124',
    width: '100%',
    padding: 12,
    fontWeight: 500,
  },
};
