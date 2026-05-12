// Renderiza un mapa conceptual a partir de markdown jerárquico usando
// markmap-lib (transformer md→tree) + markmap-view (SVG con zoom/collapse).
//
// El backend devuelve markdown con `#`/`##`/`###`/`-`. Acá lo convertimos a
// SVG y montamos. Si el markdown cambia, re-rendereamos el árbol pero
// preservamos zoom/pan del usuario.

import { useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

const transformer = new Transformer();

export default function MindMap({ markdown }) {
  const svgRef = useRef(null);
  const mmRef = useRef(null);

  useEffect(() => {
    if (!markdown || !svgRef.current) return;
    const { root } = transformer.transform(markdown);
    if (mmRef.current) {
      // Reuso del Markmap existente: solo actualiza datos.
      mmRef.current.setData(root);
      mmRef.current.fit();
    } else {
      mmRef.current = Markmap.create(svgRef.current, {
        // Tokens alineados con el design system V4 "Studious Calm".
        color: (node) => {
          const palette = ['#818CF8', '#A78BFA', '#67E8F9', '#86EFAC', '#FCD34D', '#FB923C'];
          return palette[(node.state?.depth ?? 0) % palette.length];
        },
        duration: 350,
        spacingHorizontal: 80,
        spacingVertical: 18,
        paddingX: 10,
      }, root);
    }
  }, [markdown]);

  // Cleanup cuando el componente se desmonta.
  useEffect(() => () => {
    if (mmRef.current) {
      try { mmRef.current.destroy(); } catch { /* ignore */ }
      mmRef.current = null;
    }
  }, []);

  return (
    <div style={styles.wrap}>
      <svg ref={svgRef} style={styles.svg} />
      <div style={styles.hint}>scroll = zoom · arrastrar = pan · click en nodo = colapsa/expande</div>
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
