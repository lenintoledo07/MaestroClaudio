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

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

export default function MindMap({ markdown, onNodeClick, filename = 'mapa.md' }) {
  const svgRef = useRef(null);
  const mmRef = useRef(null);

  // Exports — se usan en los botones de la toolbar arriba a la izquierda.
  const exportMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    triggerDownload(blob, filename.replace(/\.svg$|\.png$/, '') || 'mapa.md');
  };

  const exportSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    // Clonamos para no mutar el DOM montado.
    const clone = svg.cloneNode(true);
    // Asegurar dimensiones absolutas (el original es width=100% / height=100%).
    const rect = svg.getBoundingClientRect();
    clone.setAttribute('width', String(Math.round(rect.width)));
    clone.setAttribute('height', String(Math.round(rect.height)));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Embedebmos un fondo del color del card así no queda transparente.
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#17171A');
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const base = filename.replace(/\.(md|svg|png)$/i, '');
    triggerDownload(blob, `${base}.svg`);
  };

  const exportPNG = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = 2;  // 2x para que se vea decente en retina/print
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', String(Math.round(rect.width)));
    clone.setAttribute('height', String(Math.round(rect.height)));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#17171A');
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const base = filename.replace(/\.(md|svg|png)$/i, '');
      triggerDownload(blob, `${base}.png`);
    }, 'image/png');
  };

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
      <svg
        ref={svgRef}
        style={styles.svg}
        width="100%"
        height="100%"
        onClickCapture={handleClickCapture}
      />
      <div style={styles.toolbar}>
        <button style={styles.exportBtn} onClick={exportMarkdown} title="Descargar como Markdown">↓ MD</button>
        <button style={styles.exportBtn} onClick={exportSVG} title="Descargar como SVG">↓ SVG</button>
        <button style={styles.exportBtn} onClick={exportPNG} title="Descargar como PNG (2x)">↓ PNG</button>
      </div>
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
  toolbar: {
    position: 'absolute',
    top: 10,
    left: 14,
    display: 'flex',
    gap: 6,
  },
  exportBtn: {
    background: 'rgba(14,14,16,0.7)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#F4F4F5',
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace',
    cursor: 'pointer',
    fontWeight: 500,
    letterSpacing: 0.3,
  },
};
