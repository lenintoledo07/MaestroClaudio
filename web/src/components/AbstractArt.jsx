/**
 * AbstractArt — SVG generativo único por materia.
 *
 * El courseCode determina paleta y patrón:
 *   HE-*  Hacking Ético       → naranja, círculos difusos + líneas
 *   CNR-* Normativa            → púrpura, barras tipo documento
 *   MDM-* Monitorización       → cyan, círculos concéntricos
 *   GS-*  Gobierno             → verde, grid/malla
 *   *     fallback (gris)      → puntos suaves
 */

const PALETTES = {
  HE:  { from: '#818CF8', to: '#A5B4FC', accent: '#C7D2FE' },  /* indigo */
  CNR: { from: '#A78BFA', to: '#C084FC', accent: '#DDD6FE' },  /* purple */
  MDM: { from: '#67E8F9', to: '#A5F3FC', accent: '#CFFAFE' },  /* cyan */
  GS:  { from: '#86EFAC', to: '#BBF7D0', accent: '#DCFCE7' },  /* green */
  XX:  { from: '#52525B', to: '#71717A', accent: '#A1A1AA' },
};

function paletteFor(courseCode) {
  if (!courseCode) return PALETTES.XX;
  const prefix = String(courseCode).toUpperCase().split('-')[0];
  return PALETTES[prefix] || PALETTES.XX;
}

function familyFor(courseCode) {
  if (!courseCode) return 'XX';
  return String(courseCode).toUpperCase().split('-')[0];
}

export default function AbstractArt({ courseCode = 'XX', width = 320, height = 80 }) {
  const palette = paletteFor(courseCode);
  const family = familyFor(courseCode);
  const id = `art-${courseCode}`.replace(/[^a-zA-Z0-9-]/g, '');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.from} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette.to} stopOpacity="0.15" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="20%" cy="40%" r="70%">
          <stop offset="0%" stopColor={palette.accent} stopOpacity="0.45" />
          <stop offset="100%" stopColor={palette.from} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={width} height={height} fill="#181818" />
      <rect width={width} height={height} fill={`url(#${id}-bg)`} />
      <rect width={width} height={height} fill={`url(#${id}-glow)`} />

      {family === 'HE' && <Hacking width={width} height={height} palette={palette} />}
      {family === 'CNR' && <Normativa width={width} height={height} palette={palette} />}
      {family === 'MDM' && <Monitoring width={width} height={height} palette={palette} />}
      {family === 'GS' && <Gobierno width={width} height={height} palette={palette} />}
      {!['HE', 'CNR', 'MDM', 'GS'].includes(family) && (
        <Default width={width} height={height} palette={palette} />
      )}
    </svg>
  );
}

function Hacking({ width, height, palette }) {
  return (
    <g>
      <circle cx={width * 0.18} cy={height * 0.5} r={height * 0.55} fill={palette.from} opacity="0.18" />
      <circle cx={width * 0.78} cy={height * 0.3}  r={height * 0.4}  fill={palette.accent} opacity="0.20" />
      <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.6} stroke={palette.from}   strokeWidth="0.6" opacity="0.5" />
      <line x1="0" y1={height * 0.85} x2={width} y2={height * 0.7} stroke={palette.accent} strokeWidth="0.4" opacity="0.4" />
    </g>
  );
}

function Normativa({ width, height, palette }) {
  const bars = [0.1, 0.18, 0.4, 0.32, 0.55, 0.42, 0.7, 0.5];
  const w = (width - 40) / bars.length;
  return (
    <g transform={`translate(20, ${height * 0.3})`}>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * w + 2}
          y={0}
          width={w - 4}
          height={height * h}
          fill={palette.accent}
          opacity={0.4 + (i % 3) * 0.15}
          rx="1"
        />
      ))}
    </g>
  );
}

function Monitoring({ width, height, palette }) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  return (
    <g>
      {[0.2, 0.4, 0.6, 0.8, 1.0].map((r, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r * height * 0.6}
          fill="none"
          stroke={palette.accent}
          strokeWidth="0.6"
          opacity={0.5 - i * 0.08}
        />
      ))}
      <circle cx={cx} cy={cy} r="3" fill={palette.from} />
    </g>
  );
}

function Gobierno({ width, height, palette }) {
  const cols = 12;
  const rows = 4;
  const dx = width / cols;
  const dy = height / rows;
  const dots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(<circle key={`${r}-${c}`} cx={c * dx + dx / 2} cy={r * dy + dy / 2} r="1" fill={palette.accent} opacity="0.45" />);
    }
  }
  return (
    <g>
      {dots}
      <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke={palette.from} strokeWidth="0.4" opacity="0.4" />
    </g>
  );
}

function Default({ width, height, palette }) {
  const dots = [];
  for (let i = 0; i < 14; i++) {
    dots.push(
      <circle
        key={i}
        cx={(i / 13) * width + 6}
        cy={height * (0.4 + 0.2 * Math.sin(i * 0.9))}
        r="2"
        fill={palette.accent}
        opacity="0.3"
      />
    );
  }
  return <g>{dots}</g>;
}
