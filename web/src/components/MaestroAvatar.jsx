/**
 * Logo "Maestro Claudio": M estilizada formada por hexágonos conectados con
 * líneas de circuito, gradiente horizontal indigo → verde menta. SVG inline
 * para que herede colores del tema activo vía CSS variables.
 *
 * Mismo SVG escala perfecto a cualquier tamaño:
 *   <MaestroAvatar size={28} />   // bubbles del chat
 *   <MaestroAvatar size={56} />   // FAB
 *   <MaestroAvatar size={260} />  // hero del login
 */

const HEX_RADIUS = 7;

// 6 vértices de un hexágono regular vertical (flat-top hacia arriba/abajo).
function hexPoints(cx, cy, r = HEX_RADIUS) {
  const dx = r * 0.866; // cos(30°)
  const dy = r * 0.5;
  return [
    [cx, cy - r],
    [cx + dx, cy - dy],
    [cx + dx, cy + dy],
    [cx, cy + r],
    [cx - dx, cy + dy],
    [cx - dx, cy - dy],
  ].map((p) => p.join(',')).join(' ');
}

// 6 hexágonos en disposición de "M" estilizada
const HEXES = [
  // fila superior
  { cx: 22, cy: 28 },
  { cx: 50, cy: 24 },
  { cx: 78, cy: 28 },
  // centro (vértice de la M)
  { cx: 50, cy: 56 },
  // fila inferior
  { cx: 22, cy: 82 },
  { cx: 78, cy: 82 },
];

// Conexiones: hex superior → centro y centro → hex inferior
const EDGES = [
  // arriba al centro
  [0, 3],
  [1, 3],
  [2, 3],
  // centro a abajo
  [3, 4],
  [3, 5],
  // valle de la M (centro abajo, opcional para reforzar la forma)
  [4, 3],
  [3, 5],
];

export default function MaestroAvatar({ size = 48, gradientId }) {
  // gradientId único por instancia para no chocar cuando hay varios en la misma página
  const gid = gradientId || `mc-grad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Maestro Claudio"
      role="img"
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--orange)" />
          <stop offset="55%" stopColor="var(--ref)" />
          <stop offset="100%" stopColor="var(--qa)" />
        </linearGradient>
      </defs>

      {/* Líneas conectoras (ancho proporcional al viewBox) */}
      <g
        stroke={`url(#${gid})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      >
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={HEXES[a].cx}
            y1={HEXES[a].cy}
            x2={HEXES[b].cx}
            y2={HEXES[b].cy}
          />
        ))}
      </g>

      {/* Hexágonos */}
      {HEXES.map((h, i) => (
        <polygon key={i} points={hexPoints(h.cx, h.cy)} fill={`url(#${gid})`} />
      ))}
    </svg>
  );
}
