import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatInterface from '../components/ChatInterface';
import { api } from '../api/client';

/**
 * Chat global — sin scope a una materia específica. El user pregunta a
 * Maestro Claudio sobre cualquier cosa y el RAG busca en todos los
 * materiales indexados.
 */
export default function ChatPage() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    api.get('/courses')
      .then((cs) => setCourses(cs.filter((c) => c.status !== 'deleted')))
      .catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <Sidebar courses={courses} />
      <main className="main-content">
        <header className="topbar">
          <h1>Chat global</h1>
          <span className="text-mono-sm muted">contexto: todas las materias</span>
        </header>
        <ChatInterface />
      </main>
    </div>
  );
}
