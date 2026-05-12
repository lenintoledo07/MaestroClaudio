/**
 * Avatar SVG del personaje "Maestro Claudio". Inline (no externo) para que
 * los colores hereden del tema activo vía CSS variables. Dos variantes:
 *
 *   <MaestroAvatar size={48} />            // circular, busto+cara, default
 *   <MaestroAvatar size={320} variant="hero" />  // detallado, hombros visibles
 *
 * Estilizado de la ilustración original (hombre con anteojos hexagonales,
 * circuitos sobre la cara/cuello, paleta indigo+verde). No intenta ser
 * fotorealista — busca personalidad reconocible que escale bien.
 */

const COLORS = {
  bg: 'var(--bg2)',
  skin: 'var(--orange)',       // tono indigo apagado (V4 actual)
  skin2: 'var(--orange2)',     // indigo más claro para highlight
  circuit: 'var(--qa)',        // verde menta para los circuitos
  glasses: 'var(--text)',      // contorno de los anteojos
  hair: 'var(--orange)',
};

export default function MaestroAvatar({ size = 48, variant = 'circle' }) {
  if (variant === 'hero') return <Hero size={size} />;
  return <Circle size={size} />;
}

// ── Circle: busto+cara para FAB / header / bubbles ─────────────────────────

function Circle({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Maestro Claudio"
      role="img"
    >
      {/* fondo circular sutil */}
      <circle cx="50" cy="50" r="50" fill={COLORS.bg} />
      <circle cx="50" cy="50" r="49" fill="none" stroke={COLORS.skin} strokeOpacity="0.25" strokeWidth="1" />

      {/* hombros (saco) */}
      <path d="M5 100 Q5 78 30 72 L70 72 Q95 78 95 100 Z" fill={COLORS.skin} opacity="0.85" />
      {/* circuit en el cuello/saco */}
      <line x1="40" y1="78" x2="40" y2="92" stroke={COLORS.circuit} strokeWidth="0.8" />
      <circle cx="40" cy="92" r="1.2" fill={COLORS.circuit} />
      <line x1="50" y1="80" x2="50" y2="92" stroke={COLORS.circuit} strokeWidth="0.8" />
      <circle cx="50" cy="92" r="1.2" fill={COLORS.circuit} />
      <line x1="60" y1="78" x2="60" y2="92" stroke={COLORS.circuit} strokeWidth="0.8" />
      <circle cx="60" cy="92" r="1.2" fill={COLORS.circuit} />

      {/* cuello */}
      <rect x="42" y="64" width="16" height="12" fill={COLORS.skin} opacity="0.7" />

      {/* cabeza */}
      <ellipse cx="50" cy="46" rx="24" ry="26" fill={COLORS.skin} opacity="0.85" />

      {/* pelo */}
      <path d="M28 36 Q28 22 50 18 Q72 22 72 36 L72 42 Q60 33 50 33 Q40 33 28 42 Z" fill={COLORS.hair} />

      {/* circuit lines en el pelo */}
      <line x1="38" y1="28" x2="48" y2="24" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="48" cy="24" r="1" fill={COLORS.circuit} />
      <line x1="54" y1="22" x2="62" y2="26" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="62" cy="26" r="1" fill={COLORS.circuit} />

      {/* anteojos hexagonales */}
      <Glasses />

      {/* circuit en pómulo */}
      <line x1="26" y1="54" x2="33" y2="54" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="26" cy="54" r="1" fill={COLORS.circuit} />
      <line x1="67" y1="54" x2="74" y2="54" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="74" cy="54" r="1" fill={COLORS.circuit} />

      {/* sonrisa sutil */}
      <path d="M44 62 Q50 65 56 62" fill="none" stroke={COLORS.glasses} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ── Hero: visual grande para Login ─────────────────────────────────────────

function Hero({ size }) {
  // viewBox más alto para acomodar busto extendido
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Maestro Claudio"
      role="img"
    >
      {/* halo de fondo (radial glow) */}
      <defs>
        <radialGradient id="halo" cx="50%" cy="35%" r="50%">
          <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--orange)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="200" height="280" fill="url(#halo)" />

      {/* hombros + saco */}
      <path
        d="M10 280 Q10 200 60 185 L140 185 Q190 200 190 280 Z"
        fill={COLORS.skin}
        opacity="0.85"
      />

      {/* circuit en el saco — patrón paralelo */}
      {[60, 80, 100, 120, 140].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="200" x2={x} y2="270" stroke={COLORS.circuit} strokeWidth="0.9" />
          <circle cx={x} cy="270" r="1.6" fill={COLORS.circuit} />
          <circle cx={x} cy="200" r="1.6" fill={COLORS.circuit} />
        </g>
      ))}
      {/* circuits horizontales en saco */}
      <line x1="60" y1="215" x2="140" y2="215" stroke={COLORS.circuit} strokeWidth="0.5" strokeDasharray="2 4" />
      <line x1="60" y1="240" x2="140" y2="240" stroke={COLORS.circuit} strokeWidth="0.5" strokeDasharray="2 4" />

      {/* cuello + circuit "necklace" */}
      <rect x="85" y="160" width="30" height="30" fill={COLORS.skin} opacity="0.75" />
      <path d="M70 178 Q100 192 130 178" fill="none" stroke={COLORS.circuit} strokeWidth="0.8" />
      <circle cx="100" cy="186" r="1.4" fill={COLORS.circuit} />

      {/* cabeza */}
      <ellipse cx="100" cy="110" rx="50" ry="56" fill={COLORS.skin} opacity="0.88" />

      {/* pelo con circuitos */}
      <path
        d="M50 90 Q52 50 100 42 Q148 50 150 90 L150 105 Q130 80 100 80 Q70 80 50 105 Z"
        fill={COLORS.hair}
      />
      {/* circuits en el pelo */}
      <line x1="65" y1="70" x2="85" y2="58" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="85" cy="58" r="1.2" fill={COLORS.circuit} />
      <line x1="100" y1="50" x2="115" y2="60" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="115" cy="60" r="1.2" fill={COLORS.circuit} />
      <line x1="130" y1="65" x2="140" y2="78" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="140" cy="78" r="1.2" fill={COLORS.circuit} />
      <line x1="55" y1="78" x2="70" y2="82" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="55" cy="78" r="1.2" fill={COLORS.circuit} />

      {/* circuit en la frente */}
      <path d="M85 95 L92 92 L108 92 L115 95" fill="none" stroke={COLORS.circuit} strokeWidth="0.8" />
      <circle cx="100" cy="92" r="1.4" fill={COLORS.circuit} />

      {/* anteojos hexagonales más grandes */}
      <g transform="translate(50,90) scale(2)">
        <Glasses />
      </g>

      {/* circuit en pómulos */}
      <line x1="40" y1="130" x2="58" y2="130" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="40" cy="130" r="1.4" fill={COLORS.circuit} />
      <line x1="142" y1="130" x2="160" y2="130" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="160" cy="130" r="1.4" fill={COLORS.circuit} />

      {/* mentón / circuit del cuello */}
      <line x1="100" y1="155" x2="100" y2="170" stroke={COLORS.circuit} strokeWidth="0.7" />
      <circle cx="100" cy="155" r="1" fill={COLORS.circuit} />

      {/* sonrisa */}
      <path
        d="M85 142 Q100 148 115 142"
        fill="none"
        stroke={COLORS.glasses}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Anteojos hexagonales reutilizables ─────────────────────────────────────

function Glasses() {
  return (
    <g>
      {/* lente izquierdo */}
      <path
        d="M30 50 L34 46 L46 46 L50 50 L46 56 L34 56 Z"
        fill="none"
        stroke={COLORS.glasses}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* lente derecho */}
      <path
        d="M54 50 L58 46 L70 46 L74 50 L70 56 L58 56 Z"
        fill="none"
        stroke={COLORS.glasses}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* puente */}
      <line x1="50" y1="51" x2="54" y2="51" stroke={COLORS.glasses} strokeWidth="1.8" />
      {/* "ojos" — circuitos chiquitos en los lentes */}
      <line x1="36" y1="51" x2="44" y2="51" stroke={COLORS.circuit} strokeWidth="0.6" />
      <circle cx="44" cy="51" r="0.8" fill={COLORS.circuit} />
      <line x1="60" y1="51" x2="68" y2="51" stroke={COLORS.circuit} strokeWidth="0.6" />
      <circle cx="60" cy="51" r="0.8" fill={COLORS.circuit} />
    </g>
  );
}
