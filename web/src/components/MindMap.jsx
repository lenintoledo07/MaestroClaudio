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

// Marca nodos a profundidad > maxDepth como "folded" (colapsados). Markmap
// respeta `payload.fold = 1` y muestra solo los abuelos.
function foldBelow(node, maxDepth, depth = 0) {
  if (!node) return;
  if (depth > maxDepth) {
    node.payload = { ...(node.payload || {}), fold: 1 };
  }
  (node.children || []).forEach((c) => foldBelow(c, maxDepth, depth + 1));
}

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
    // Forzar colapso de cualquier nodo a profundidad >= 2 antes de pasarlo
    // a markmap. Así inicialmente solo se ve raíz + grandes temas.
    foldBelow(root, 1);
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
          // Mostrar inicial: raíz (#) + grandes temas (##). El user expande
          // los sub-temas y hojas haciendo click en la bolita lateral.
          initialExpandLevel: 1,
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

  // Click capture: corre ANTES que los listeners de markmap (que están
  // suscritos en cada <g class="markmap-node">). Si el click fue sobre el
  // texto del nodo (.markmap-foreign), invocamos onNodeClick y frenamos
  // el evento para que markmap no colapse la rama también.
  const handleClickCapture = (e) => {
    if (!onNodeClick) return;
    const textEl = e.target.closest('.markmap-foreign');
    if (!textEl) return;  // click en circle/line/etc → dejar a markmap
    const text = (textEl.textContent || '').trim();
    if (!text) return;
    e.stopPropagation();
    e.preventDefault();
    onNodeClick(text);
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
        onClickCapture={handleClickCapture}
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
