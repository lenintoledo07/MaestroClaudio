import { useEffect, useState } from 'react';

export const THEMES = [
  {
    id: 'dark-indigo',
    label: 'Dark Indigo',
    description: 'Studious Calm — fondo oscuro frío con acento indigo (default)',
    swatches: ['#0E0E10', '#17171A', '#818CF8', '#F4F4F5'],
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Linear/Notion light — blanco con acento indigo saturado',
    swatches: ['#FAFAFA', '#E9E9EC', '#6366F1', '#18181B'],
  },
  {
    id: 'sepia',
    label: 'Sepia / Papel',
    description: 'Papel cremoso con tinta marrón — para sesiones largas de lectura',
    swatches: ['#F6F0E6', '#EFE6D8', '#8B3E2F', '#2A2418'],
  },
  {
    id: 'dark-warm',
    label: 'Dark Warm',
    description: 'Dark con paleta cálida ámbar — más acogedor que el indigo frío',
    swatches: ['#0F0D0A', '#1A1612', '#F59E0B', '#F4EFE5'],
  },
];

const STORAGE_KEY = 'mc.theme';
const DEFAULT_THEME = 'dark-indigo';
const VALID_IDS = new Set(THEMES.map((t) => t.id));

/** Lee el tema actual del DOM. Si no hay seteado, devuelve DEFAULT_THEME. */
export function getCurrentTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return VALID_IDS.has(stored) ? stored : DEFAULT_THEME;
}

/** Aplica el tema al <html data-theme="..."> y lo persiste. */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const valid = VALID_IDS.has(theme) ? theme : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', valid);
  try { window.localStorage.setItem(STORAGE_KEY, valid); } catch { /* ignore */ }
  // Notifica al resto de la app (otros useTheme en distintos componentes)
  window.dispatchEvent(new CustomEvent('mc-theme-change', { detail: valid }));
}

/** Hook que devuelve [theme, setTheme] sincronizado entre componentes. */
export function useTheme() {
  const [theme, setThemeState] = useState(getCurrentTheme);

  useEffect(() => {
    const onChange = (e) => setThemeState(e.detail || getCurrentTheme());
    window.addEventListener('mc-theme-change', onChange);
    return () => window.removeEventListener('mc-theme-change', onChange);
  }, []);

  const setTheme = (next) => {
    applyTheme(next);
    setThemeState(next);
  };
  return [theme, setTheme];
}
