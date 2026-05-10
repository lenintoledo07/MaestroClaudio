import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const MODES = [
  { key: 'explain',     label: 'Explicar' },
  { key: 'quiz',        label: 'Quiz' },
  { key: 'flashcards',  label: 'Flashcards' },
  { key: 'exam_prep',   label: 'Examen' },
];

export default function ChatInterface({ courseId, moduleId, materialId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('explain');
  const [conversationId, setConversationId] = useState(null);
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo(0, scrollerRef.current.scrollHeight);
  }, [messages]);

  // Reset al cambiar de scope
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
  }, [courseId, moduleId, materialId]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    try {
      const r = await api.post('/chat', {
        query: q,
        conversation_id: conversationId,
        course_id: courseId || null,
        module_id: moduleId || null,
        mode,
      });
      setConversationId(r.conversation_id);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: r.answer,
        sources: r.sources,
        mode: r.mode,
        quiz: r.quiz_questions,
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e.body?.detail || e.status}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '60vh', padding: 0 }}>
      <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--border)', gap: 6 }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`tag ${mode === m.key ? 'tag-ref' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0 && (
          <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>
            Hacé una pregunta. El modo <b>Examen</b> usa también todos los exam-tips del curso como contexto.
          </p>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} m={m} />
        ))}
      </div>

      <div className="row" style={{ padding: 12, borderTop: '1px solid var(--border)', gap: 8 }}>
        <input
          type="text"
          placeholder="Preguntá lo que quieras..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
          style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: '10px 14px' }}
        />
        <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={send}>
          {busy ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}

function ChatMessage({ m }) {
  const isUser = m.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'var(--orange)' : 'var(--bg2)',
        border: isUser ? 'none' : '1px solid var(--border)',
        color: isUser ? '#0E0E10' : 'var(--text)',
        padding: '12px 16px',
        borderRadius: 14,
        // Las respuestas del asistente son contenido para LEER → serif.
        // Los mensajes del user son chrome/UI → sans-serif.
        fontFamily: isUser
          ? 'Inter, sans-serif'
          : 'Newsreader, Georgia, serif',
        fontSize: isUser ? 13.5 : 15,
        lineHeight: isUser ? 1.5 : 1.6,
        whiteSpace: 'pre-wrap',
      }}>
        {m.content}
        {m.sources?.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-mono-sm" style={{ marginBottom: 6, opacity: 0.7 }}>FUENTES</div>
            {m.sources.slice(0, 4).map((s, i) => (
              <div key={i} style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
                <span style={{ marginRight: 6 }}>{s.kind === 'pinned' ? '📌' : '◇'}</span>
                {s.module_name || s.course_name || '—'}
                {s.similarity != null && <span> · {(s.similarity * 100).toFixed(0)}%</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
