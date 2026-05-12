// Drawer/modal que se abre al hacer doble-click en un nodo del MindMap.
// Muestra el texto del nodo arriba + un chat embebido scoped al curso, con
// initialQuery pre-llenado pidiendo profundizar el concepto usando primero
// los materiales del usuario y completando con conocimiento general si no
// alcanza.

import { useEffect } from 'react';
import ChatInterface from './ChatInterface';

export default function NodeDeepDiveModal({ nodeText, courseId, materialName, onClose }) {
  // Cerrar con ESC.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!nodeText) return null;

  const initialQuery = (
    `Profundizá el concepto "${nodeText}"` +
    (materialName ? ` que aparece en mi clase "${materialName}"` : '') +
    `. Buscá primero en mis materiales (contexto recuperado por RAG). ` +
    `Si no tenés información suficiente ahí, completalo con tu conocimiento ` +
    `general, marcando claramente qué viene de afuera. Si conviene, sugerí ` +
    `lecturas o referencias adicionales para investigar.`
  );

  return (
    <div onClick={onClose} style={styles.backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={styles.modal}>
        <div style={styles.header}>
          <div style={{ flex: 1 }}>
            <div className="text-mono-sm" style={{ color: 'var(--muted)', marginBottom: 6 }}>
              NODO DEL MAPA
            </div>
            <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 19, lineHeight: 1.4 }}>
              {nodeText}
            </div>
            {materialName && (
              <div className="text-small muted" style={{ marginTop: 6 }}>
                de · {materialName}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={styles.closeBtn}>×</button>
        </div>

        <div style={styles.chatSection}>
          <div className="text-mono-sm muted" style={{ marginBottom: 10 }}>
            PROFUNDIZÁ CON MAESTRO CLAUDIO
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatInterface
              key={nodeText}
              courseId={courseId}
              initialQuery={initialQuery}
              height="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    zIndex: 100,
    display: 'grid', placeItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%', maxWidth: 880, maxHeight: '92vh',
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: 24,
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    maxHeight: '40vh',
    overflowY: 'auto',
  },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'var(--muted)',
    fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4,
  },
  chatSection: {
    flex: 1, padding: 20, minHeight: 0,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',  // crea contexto de stacking para que el flex hijo pueda scrollear
  },
};
