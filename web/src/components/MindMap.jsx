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

// CSS inyectado dentro del SVG de markmap. OJO: el SVG no hereda las CSS
// vars del documento (var(--text) queda undefined), así que usamos valores
// hex directos. Sin esto las letras quedan invisibles sobre fondo oscuro.
const EXTRA_CSS = `
.markmap-foreign {
  font-family: 'Newsreader', Georgia, serif;
  font-size: 17px;
  font-weight: 500;
  color: #F4F4F5;
  cursor: pointer;
}
.markmap-foreign p {
  color: #F4F4F5;
  margin: 0;
  white-space: nowrap;
}
.markmap-foreign a {
  color: #A5B4FC;
}
.markmap-foreign strong {
  font-weight: 700;
}
.markmap-foreign code {
  background: rgba(255,255,255,0.08);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 14px;
}
.markmap-node:hover .markmap-foreign {
  text-decoration: underline;
  text-decoration-color: rgba(255,255,255,0.4);
}
.markmap-link {
  stroke-width: 2px;
  opacity: 0.85;
}
.markmap-node circle {
  cursor: pointer;
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
          // fitRatio menor = más margen alrededor = nodos más grandes en pantalla.
          fitRatio: 0.85,
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

  // Click sobre el texto del nodo → profundizar (abre chat).
  // Click sobre el círculo (la bolita de toggle) → markmap colapsa la rama.
  // El SVG generado tiene estructura:
  //   <g class="markmap-node">
  //     <circle/>          ← collapse toggle (lo dejamos pasar al handler de markmap)
  //     <line/>            ← línea al padre (ignorar)
  //     <foreignObject>    ← contiene <div><p>texto</p></div> (CLICK aquí = profundizar)
  //   </g>
  const handleClick = (e) => {
    if (!onNodeClick) return;
    const tag = e.target.tagName;
    // Solo intervenimos si el click fue dentro del foreignObject (texto).
    // Si fue en circle/line del SVG, lo dejamos para el handler nativo de
    // markmap (collapse/expand).
    const inForeign = e.target.closest('foreignObject');
    if (!inForeign) return;
    if (tag === 'circle' || tag === 'line') return;
    const node = e.target.closest('.markmap-node');
    if (!node) return;
    const div = node.querySelector('foreignObject div');
    const text = (div?.textContent || '').trim();
    if (text) {
      e.stopPropagation();
      onNodeClick(text);
    }
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
        onClick={handleClick}
      />
      <div style={styles.hint}>
        🔍 <b>click en un texto</b> = profundizar · click en la bolita = colapsar
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
    top: 10,
    right: 14,
    fontSize: 12,
    color: '#F4F4F5',
    background: 'rgba(14,14,16,0.7)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '6px 10px',
    borderRadius: 8,
    pointerEvents: 'none',
  },
};
