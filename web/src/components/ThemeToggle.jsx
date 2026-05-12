import { useEffect, useRef, useState } from 'react';
import { THEMES, useTheme } from '../hooks/useTheme';

const ICONS = {
  'dark-indigo': '◐',
  'light':       '○',
  'sepia':       '◓',
  'dark-warm':   '◑',
};

/**
 * Toggle de tema flotante top-right. Click muestra dropdown con las 4 opciones.
 * Persiste en localStorage via useTheme.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div ref={wrapRef} className="theme-toggle-wrap">
      <button
        className="theme-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        title={`Tema: ${current.label}`}
        aria-label="Cambiar tema"
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{ICONS[theme] || '◐'}</span>
      </button>

      {open && (
        <div className="theme-toggle-menu">
          <div className="text-mono-sm" style={{ padding: '8px 12px', color: 'var(--muted)', letterSpacing: 1.5 }}>
            TEMA
          </div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-toggle-item ${t.id === theme ? 'active' : ''}`}
              onClick={() => { setTheme(t.id); setOpen(false); }}
            >
              <div className="theme-toggle-swatches">
                {t.swatches.map((s, i) => (
                  <span key={i} style={{ background: s }} />
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</div>
                <div className="text-small muted" style={{ marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.description}
                </div>
              </div>
              {t.id === theme && <span style={{ color: 'var(--orange)', fontSize: 14 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
