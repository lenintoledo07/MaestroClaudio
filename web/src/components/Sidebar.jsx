import { NavLink, useNavigate } from 'react-router-dom';
import AbstractArt from './AbstractArt';
import CourseMenu from './CourseMenu';
import MaestroAvatar from './MaestroAvatar';
import { useAuth } from '../hooks/useAuth';

const NAV_ITEMS = [
  { label: 'Dashboard',    to: '/dashboard', icon: '◈' },
  { label: 'Calendario',   to: '/calendar',  icon: '▦' },
  { label: 'Chat Global',  to: '/chat',      icon: '◍' },
];

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '·';
}

export default function Sidebar({ courses = [], processing = 0, onAddCourse, onCourseChanged }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MaestroAvatar size={32} />
        <div className="logo-text">MAESTRO CLAUDIO</div>
      </div>

      {user && (
        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
          <div className="avatar">{initials(user.name || user.email)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.name || user.email}
            </div>
            <div className="text-small" style={{ cursor: 'pointer' }} onClick={logout}>cerrar sesión</div>
          </div>
        </div>
      )}

      <nav className="col" style={{ gap: 2 }}>
        {NAV_ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="icon" aria-hidden>{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="icon" aria-hidden>⚙</span>
          <span>Ajustes</span>
        </NavLink>
      </nav>

      <div>
        <div className="text-mono-sm" style={{ color: 'var(--muted)', marginBottom: 8, padding: '0 4px' }}>
          MIS MATERIAS
        </div>
        <div className="col" style={{ gap: 4 }}>
          {courses.map((c) => (
            <div
              key={c.id}
              className="course-chip"
              onClick={() => navigate(`/course/${c.id}`)}
              style={{ alignItems: 'center', position: 'relative' }}
            >
              <div style={{ width: 36, height: 22, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                <AbstractArt courseCode={c.code} width={120} height={36} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </div>
                <div className="text-small">{c.code || ' '}</div>
              </div>
              <CourseMenu course={c} onChanged={onCourseChanged} />
            </div>
          ))}
        </div>

        <button
          className="btn btn-ghost"
          style={{
            marginTop: 10,
            width: '100%',
            borderStyle: 'dashed',
            color: 'var(--muted)',
            fontSize: 12,
          }}
          onClick={onAddCourse}
        >
          + Agregar materia
        </button>

        {processing > 0 && (
          <div style={{ marginTop: 14 }}>
            <span className="pill processing">{processing} procesando</span>
          </div>
        )}
      </div>
    </aside>
  );
}
