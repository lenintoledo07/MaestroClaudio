import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CourseDetail from './pages/CourseDetail';
import ClassDetail from './pages/ClassDetail';
import ChatPage from './pages/ChatPage';
import CalendarPage from './pages/CalendarPage';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import SignalsPage from './pages/SignalsPage';

function ProtectedRoute({ children, requireOnboarding = true }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p className="muted">Cargando…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // Si no completó el onboarding (no tiene drive_folder_id), forzar wizard.
  // La propia /onboarding pasa requireOnboarding=false para evitar loop.
  if (requireOnboarding && !user.drive_folder_id && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<ProtectedRoute requireOnboarding={false}><Onboarding /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/course/:id" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
        <Route path="/class/:id" element={<ProtectedRoute><ClassDetail /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/signals/:kind" element={<ProtectedRoute><SignalsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
