// Renderiza un mapa conceptual a partir de markdown jerárquico usando
// markmap-lib (transformer md→tree) + markmap-view (SVG con zoom/collapse).
//
// Interacciones:
// - click en un nodo: toggle colapsar/expandir (default de markmap).
// - DOBLE click en un nodo: invoca onNodeClick(text) para profundizar.

import { useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

const transformer = new Transformer();

// Paleta más saturada que la default — pensada para fondo oscuro. Cada nivel
// de profundidad usa un color distinto cycle.
const PALETTE = [
  '#A5B4FC',  // indigo (raíz)
  '#67E8F9',  // cyan
  '#86EFAC',  // lime
  '#FCD34D',  // amber
  '#FB923C',  // orange
  '#F472B6',  // pink
  '#C4B5FD',  // violet
];

// CSS inyectado dentro del SVG de markmap para hacer las letras más grandes
// y legibles contra el fondo oscuro de la app. markmap acepta `extraCss`.
const EXTRA_CSS = `
.markmap-foreign {
  font-family: 'Newsreader', Georgia, serif !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  color: var(--text, #F4F4F5) !important;
  cursor: pointer;
}
.markmap-foreign a {
  color: var(--orange, #818CF8) !important;
}
.markmap-foreign strong {
  font-weight: 700 !important;
}
.markmap-link {
  stroke-width: 2px !important;
  opacity: 0.85;
}
`;

export default function MindMap({ markdown, onNodeClick }) {
  const svgRef = useRef(null);
  const mmRef = useRef(null);

  useEffect(() => {
    if (!markdown || !svgRef.current) return;
    let cancelled = false;
    const { root } = transformer.transform(markdown);
    if (mmRef.current) {
      try { mmRef.current.setData(root); } catch (e) { console.error('markmap setData', e); }
    } else {
      // OJO con las options: en markmap-view 0.18 algunos campos cambiaron
      // y pasar opciones inválidas tira "t is not a function" en runtime.
      // Mantenemos lo mínimo + extraCss para nuestro look.
      try {
        mmRef.current = Markmap.create(svgRef.current, {
          color: (node) => {
            const depth = node?.state?.depth ?? node?.depth ?? 0;
            return PALETTE[depth % PALETTE.length];
          },
          duration: 350,
          extraCss: EXTRA_CSS,
        }, root);
      } catch (e) {
        // Fallback: sin opciones custom si algo se rompe.
        console.error('markmap create failed, retrying without options', e);
        mmRef.current = Markmap.create(svgRef.current, undefined, root);
      }
    }
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try { mmRef.current?.fit(); } catch { /* ignore */ }
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [markdown]);

  // Cleanup cuando el componente se desmonta.
  useEffect(() => () => {
    if (mmRef.current) {
      try { mmRef.current.destroy(); } catch { /* ignore */ }
      mmRef.current = null;
    }
  }, []);

  // Doble-click en un nodo → callback con su texto. Markmap usa <g class="markmap-node">
  // con un <foreignObject> que contiene un div con el contenido. Levantamos el
  // texto desde ahí. Single-click se preserva para el toggle nativo.
  const handleDoubleClick = (e) => {
    if (!onNodeClick) return;
    const node = e.target.closest('.markmap-node');
    if (!node) return;
    const div = node.querySelector('foreignObject div');
    const text = (div?.textContent || '').trim();
    if (text) onNodeClick(text);
  };

  return (
    <div style={styles.wrap}>
      {/* width/height como attributes (no solo style) — markmap usa el bounding
          rect del SVG para calcular el fit. */}
      <svg
        ref={svgRef}
        style={styles.svg}
        width="100%"
        height="100%"
        onDoubleClick={handleDoubleClick}
      />
      <div style={styles.hint}>
        scroll = zoom · arrastrar = pan · click = colapsa/expande · <b>doble-click = profundizar</b>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'relative',
    width: '100%',
    height: '70vh',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  svg: { width: '100%', height: '100%' },
  hint: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--muted)',
    pointerEvents: 'none',
  },
};
