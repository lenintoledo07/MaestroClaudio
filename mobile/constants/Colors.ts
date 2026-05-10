// Maestro Claudio — Design System V4 "Studious Calm"
// Espejo de web/src/styles/tokens.css. La key `orange` se mantiene
// por compat con el código existente, pero el VALOR es indigo apagado.

export const Colors = {
  bg: '#0E0E10',
  bg2: '#17171A',
  bg3: '#1E1E22',
  bg4: '#2A2A2E',

  orange: '#818CF8',     // indigo apagado (no naranja)
  orange2: '#A5B4FC',

  // Tipos de señales — solo donde de verdad importan
  tip: '#F59E0B',
  ref: '#818CF8',
  qa: '#22C55E',
  pending: '#EF4444',

  // Por materia (4 fijas) — versiones muteadas
  cHacking: '#818CF8',
  cNormativa: '#A78BFA',
  cMonitoring: '#67E8F9',
  cGobierno: '#86EFAC',

  text: '#F4F4F5',
  muted: '#A1A1AA',
  muted2: '#52525B',
  border: '#27272A',
  border2: '#323237',
} as const;

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const Radius = {
  sm: 6, md: 12, lg: 16, full: 999,
};
