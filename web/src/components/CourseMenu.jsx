import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import CourseModal from './CourseModal';

export default function CourseMenu({ course, onChanged }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const patchStatus = async (status) => {
    try {
      await api.patch(`/courses/${course.id}`, { status });
      setOpen(false);
      onChanged?.();
    } catch (e) {
      alert(`No se pudo cambiar el estado: ${e.status || e.message}`);
    }
  };

  const remove = async () => {
    const ok = window.confirm(
      `Esta acción eliminará todo el contenido de "${course.name}".\n\nEscribí "BORRAR" para confirmar.`
    );
    if (!ok) return;
    const typed = window.prompt('Confirmá escribiendo BORRAR');
    if (typed !== 'BORRAR') return;
    try {
      await api.del(`/courses/${course.id}`, { confirm: true });
      setOpen(false);
      onChanged?.();
    } catch (e) {
      alert(`No se pudo eliminar: ${e.status || e.message}`);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        className="nav-item"
        style={{ padding: 4, color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}
        onClick={() => setOpen((o) => !o)}
        aria-label="opciones"
      >
        ⋯
      </button>
      {open && (
        <div style={menuStyles.dropdown}>
          <button style={menuStyles.item} onClick={() => { setOpen(false); setEditing(true); }}>
            Editar materia
          </button>
          {course.status === 'active' && (
            <>
              <button style={menuStyles.item} onClick={() => patchStatus('paused')}>Pausar</button>
              <button style={menuStyles.item} onClick={() => patchStatus('completed')}>Marcar completada</button>
            </>
          )}
          {(course.status === 'paused' || course.status === 'completed') && (
            <button style={menuStyles.item} onClick={() => patchStatus('active')}>Restaurar</button>
          )}
          <div className="divider" style={{ margin: '4px 0' }} />
          <button style={{ ...menuStyles.item, color: 'var(--pending)' }} onClick={remove}>
            Eliminar
          </button>
        </div>
      )}
      {editing && (
        <CourseModal
          course={course}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged?.(); }}
        />
      )}
    </div>
  );
}

const menuStyles = {
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: 4,
    minWidth: 180,
    background: 'var(--bg3)',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-md)',
    padding: 4,
    zIndex: 50,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  item: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
  },
};
