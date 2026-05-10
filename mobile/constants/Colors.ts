// Maestro Claudio — Design System V3 "Abstract Intelligence"
// Mismos tokens que web/src/styles/tokens.css.

export const Colors = {
  bg: '#111111',
  bg2: '#181818',
  bg3: '#202020',
  bg4: '#282828',

  orange: '#FF4D1C',
  orange2: '#FF7A4D',

  // Tipos de señales
  tip: '#F59E0B',
  ref: '#FF4D1C',
  qa: '#22C55E',
  pending: '#EF4444',

  // Por materia (4 fijas)
  cHacking: '#FF4D1C',
  cNormativa: '#8B5CF6',
  cMonitoring: '#06B6D4',
  cGobierno: '#22C55E',

  text: '#EFEFEF',
  muted: '#777777',
  muted2: '#444444',
  border: '#252525',
  border2: '#303030',
} as const;

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const Radius = {
  sm: 6, md: 12, lg: 16, full: 999,
};
