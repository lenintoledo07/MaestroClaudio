import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ChatInterface from './ChatInterface';
import { useAuth } from '../hooks/useAuth';

/**
 * FAB global + panel flotante para abrir el chat con Maestro desde cualquier
 * pantalla. Estados: closed → floating (panel angosto pegado a la derecha) →
 * fullscreen (overlay). Atajo ⌘K (Mac) / Ctrl+K (Windows). Se oculta en /chat
 * (la página dedicada ya es chat) y en /login, /onboarding.
 */
export default function ChatLauncher() {
  const [state, setState] = useState('closed');
  const location = useLocation();
  const { user } = useAuth();

  // Cerrar al cambiar de ruta (evita panel huérfano si el user navega
  // mientras está abierto).
  useEffect(() => {
    setState('closed');
  }, [location.pathname]);

  // Atajo de teclado: ⌘K / Ctrl+K toggle floating, Esc cierra.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setState((s) => (s === 'closed' ? 'floating' : 'closed'));
      } else if (e.key === 'Escape' && state !== 'closed') {
        setState('closed');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  // Ocultar sin sesión, sin onboarding, o en rutas donde no aporta (login,
  // onboarding, /chat que ya es la pantalla dedicada).
  const hiddenRoutes = ['/login', '/onboarding', '/chat'];
  if (!user || !user.drive_folder_id) return null;
  if (hiddenRoutes.includes(location.pathname)) return null;

  return (
    <>
      {state === 'closed' && (
        <button
          className="chat-launcher-fab"
          onClick={() => setState('floating')}
          title="Abrir Maestro (⌘K)"
          aria-label="Abrir chat con Maestro"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          <span className="chat-launcher-pulse" />
        </button>
      )}

      {state === 'fullscreen' && (
        <div className="chat-launcher-scrim" onClick={() => setState('floating')} />
      )}

      {state !== 'closed' && (
        <aside className={`chat-launcher-panel ${state === 'fullscreen' ? 'is-fullscreen' : 'is-floating'}`}>
          <div className="chat-launcher-head">
            <div>
              <h3>Maestro Claudio</h3>
              <div className="chat-launcher-ctx">CTX · TODAS LAS MATERIAS</div>
            </div>
            <div className="chat-launcher-actions">
              <button
                className="chat-launcher-icon-btn"
                onClick={() => setState(state === 'fullscreen' ? 'floating' : 'fullscreen')}
                title={state === 'fullscreen' ? 'Reducir' : 'Expandir a pantalla completa'}
                aria-label={state === 'fullscreen' ? 'Reducir' : 'Expandir'}
              >
                {state === 'fullscreen' ? (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 4v6H3M21 14h-6v6M14 10l7-7M10 14l-7 7" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7" />
                  </svg>
                )}
              </button>
              <button
                className="chat-launcher-icon-btn"
                onClick={() => setState('closed')}
                title="Cerrar (Esc)"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>
          <div className="chat-launcher-body">
            <ChatInterface height="100%" />
          </div>
        </aside>
      )}
    </>
  );
}
