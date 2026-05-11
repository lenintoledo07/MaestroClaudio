import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatInterface from './ChatInterface';

const IMPORTANCE_LABEL = { high: 'Alta', medium: 'Media', low: 'Baja' };
const IMPORTANCE_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#A1A1AA' };

const KIND_LABEL = {
  exam_tip:  'Exam Tip',
  reference: 'Referencia',
  qa:        'Q&A',
};

export default function SignalDetail({ signal, onClose }) {
  // Cerrar con ESC.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const navigate = useNavigate();

  if (!signal) return null;

  const kindLabel = KIND_LABEL[signal.type] || signal.type;
  // Query inicial que mandamos por defecto al chat. El user puede editarlo
  // antes de apretar Enter.
  const initialQuery = (
    `Profundizá este ${kindLabel.toLowerCase()} de mi clase: "${signal.content}". ` +
    `Si no tenés información suficiente en mis materiales, completalo con tu ` +
    `conocimiento general (marcando claramente qué viene de afuera).`
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'grid', placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 880, maxHeight: '92vh',
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header con el signal */}
        <div style={{ padding: 24, borderBottom: '1px solid var(--border)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: 'center' }}>
                <span
                  className="text-mono-sm"
                  style={{
                    background: IMPORTANCE_COLOR[signal.importance] || 'var(--muted)',
                    color: '#0E0E10', padding: '2px 8px', borderRadius: 4,
                    fontSize: 11, fontWeight: 600,
                  }}
                >
                  {kindLabel.toUpperCase()} · {IMPORTANCE_LABEL[signal.importance] || signal.importance}
                </span>
                <span className="text-small muted">
                  {signal.course_name}
                  {signal.module_name && ` · ${signal.module_name}`}
                  {signal.week_number != null && ` · sem ${signal.week_number}`}
                </span>
              </div>
              <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 17, lineHeight: 1.55 }}>
                {signal.content}
              </div>
              {signal.context && (
                <div className="text-small muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
                  ↳ {signal.context}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                background: 'transparent', border: 'none', color: 'var(--muted)',
                fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4,
              }}
            >
              ×
            </button>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            {signal.material_id && (
              <button className="btn btn-ghost" onClick={() => navigate(`/class/${signal.material_id}`)}>
                Ir a la clase →
              </button>
            )}
          </div>
        </div>

        {/* Chat embebido, scoped al curso del signal */}
        <div style={{ flex: 1, padding: 20, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="text-mono-sm muted" style={{ marginBottom: 10 }}>
            PROFUNDIZÁ CON MAESTRO CLAUDIO
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatInterface
              key={signal.id}
              courseId={signal.course_id}
              initialQuery={initialQuery}
              height="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
