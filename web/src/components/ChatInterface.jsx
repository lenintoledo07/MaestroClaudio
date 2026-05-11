import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const MODES = [
  { key: 'explain',     label: 'Explicar' },
  { key: 'quiz',        label: 'Quiz' },
  { key: 'flashcards',  label: 'Flashcards' },
  { key: 'exam_prep',   label: 'Examen' },
];

export default function ChatInterface({ courseId, moduleId, materialId, initialQuery = '', height = '60vh' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(initialQuery);
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

  // Pre-llenar el input si cambia el initialQuery (ej. abrís otro signal en
  // el mismo drawer y el chat se mantiene montado).
  useEffect(() => {
    if (initialQuery) setInput(initialQuery);
  }, [initialQuery]);

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
      // Para quiz el backend manda `quiz_questions` ya parseado. Para flashcards
      // el array viene como JSON dentro de `answer`. Detectamos y parseamos.
      let structured = null;
      if (r.mode === 'quiz' && Array.isArray(r.quiz_questions)) {
        structured = { type: 'quiz', data: r.quiz_questions };
      } else if (r.mode === 'flashcards') {
        try {
          const parsed = JSON.parse(r.answer);
          if (Array.isArray(parsed)) structured = { type: 'flashcards', data: parsed };
        } catch { /* deja que se muestre como texto */ }
      }
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: r.answer,
        sources: r.sources,
        mode: r.mode,
        structured,
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e.body?.detail || e.status}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height, padding: 0 }}>
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
  // Si es respuesta estructurada (quiz/flashcards), renderizamos el componente
  // dedicado en vez del string JSON crudo. Sources se muestran abajo igual.
  const isStructured = !isUser && m.structured;

  if (isStructured) {
    return (
      <div style={{ marginBottom: 12 }}>
        {m.structured.type === 'quiz' && <QuizView questions={m.structured.data} />}
        {m.structured.type === 'flashcards' && <FlashcardsView cards={m.structured.data} />}
        {m.sources?.length > 0 && <SourcesList sources={m.sources} />}
      </div>
    );
  }

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
        {m.sources?.length > 0 && <SourcesList sources={m.sources} inline />}
      </div>
    </div>
  );
}

function SourcesList({ sources, inline = false }) {
  return (
    <div style={{
      marginTop: inline ? 8 : 12,
      paddingTop: 8,
      borderTop: inline ? '1px solid rgba(255,255,255,0.1)' : '1px solid var(--border)',
    }}>
      <div className="text-mono-sm" style={{ marginBottom: 6, opacity: 0.7 }}>FUENTES</div>
      {sources.slice(0, 4).map((s, i) => (
        <div key={i} style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
          <span style={{ marginRight: 6 }}>{s.kind === 'pinned' ? '📌' : '◇'}</span>
          {s.module_name || s.course_name || '—'}
          {s.similarity != null && <span> · {(s.similarity * 100).toFixed(0)}%</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Quiz interactivo ──────────────────────────────────────────────────────

function QuizView({ questions }) {
  // Estado por pregunta: índice elegido (o null si todavía no respondió).
  const [picks, setPicks] = useState(() => questions.map(() => null));

  // Normaliza el campo `correct` que puede venir como letra ("A","B"...) o índice (0..3).
  const correctIndex = (q) => {
    if (typeof q.correct === 'number') return q.correct;
    if (typeof q.correct === 'string') {
      const letter = q.correct.trim().toUpperCase().charAt(0);
      const idx = letter.charCodeAt(0) - 'A'.charCodeAt(0);
      if (idx >= 0 && idx < (q.options?.length || 4)) return idx;
    }
    return -1;  // no parseable
  };

  const answeredCount = picks.filter((p) => p !== null).length;
  const correctCount = picks.reduce((acc, pick, i) => (
    pick != null && pick === correctIndex(questions[i]) ? acc + 1 : acc
  ), 0);
  const allAnswered = answeredCount === questions.length;

  return (
    <div className="card" style={{ maxWidth: '78%', padding: 16, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="text-mono-sm" style={{ opacity: 0.7 }}>QUIZ</div>
        {allAnswered && (
          <div className="text-mono-sm" style={{ color: 'var(--orange)' }}>
            {correctCount}/{questions.length}
          </div>
        )}
      </div>
      <div className="col" style={{ gap: 18 }}>
        {questions.map((q, qi) => {
          const pick = picks[qi];
          const correct = correctIndex(q);
          const answered = pick != null;
          return (
            <div key={qi}>
              <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 15, marginBottom: 8 }}>
                <strong>{qi + 1}. </strong>{q.question}
              </div>
              <div className="col" style={{ gap: 4 }}>
                {(q.options || []).map((opt, oi) => {
                  const isPick = pick === oi;
                  const isCorrect = correct === oi;
                  let bg = 'var(--bg3)';
                  let border = '1px solid var(--border)';
                  if (answered) {
                    if (isCorrect) { bg = 'rgba(34,197,94,0.15)'; border = '1px solid #22C55E'; }
                    else if (isPick) { bg = 'rgba(239,68,68,0.15)'; border = '1px solid #EF4444'; }
                  }
                  return (
                    <button
                      key={oi}
                      onClick={() => !answered && setPicks((p) => p.map((v, i) => i === qi ? oi : v))}
                      disabled={answered}
                      style={{
                        textAlign: 'left',
                        background: bg,
                        border,
                        borderRadius: 8,
                        padding: '8px 12px',
                        cursor: answered ? 'default' : 'pointer',
                        fontSize: 13.5,
                        color: 'var(--text)',
                      }}
                    >
                      <span style={{ opacity: 0.6, marginRight: 8, fontFamily: 'monospace' }}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                      {answered && isCorrect && <span style={{ float: 'right' }}>✓</span>}
                      {answered && isPick && !isCorrect && <span style={{ float: 'right' }}>✗</span>}
                    </button>
                  );
                })}
              </div>
              {answered && q.explanation && (
                <div className="text-small" style={{ marginTop: 6, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, opacity: 0.85 }}>
                  <span style={{ opacity: 0.7 }}>↳ </span>{q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Flashcards con flip ───────────────────────────────────────────────────

function FlashcardsView({ cards }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];

  const go = (delta) => {
    const next = Math.max(0, Math.min(cards.length - 1, index + delta));
    if (next !== index) {
      setIndex(next);
      setFlipped(false);
    }
  };

  if (!card) return null;

  return (
    <div className="card" style={{ maxWidth: '78%', padding: 16, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="text-mono-sm" style={{ opacity: 0.7 }}>FLASHCARDS</div>
        <div className="text-mono-sm" style={{ opacity: 0.7 }}>
          {index + 1} / {cards.length}
        </div>
      </div>

      <button
        onClick={() => setFlipped((f) => !f)}
        style={{
          width: '100%',
          minHeight: 180,
          padding: '24px 20px',
          background: flipped ? 'rgba(129,140,248,0.08)' : 'var(--bg3)',
          border: '1px solid var(--border2)',
          borderRadius: 12,
          cursor: 'pointer',
          fontFamily: 'Newsreader, Georgia, serif',
          fontSize: 17,
          lineHeight: 1.6,
          color: 'var(--text)',
          textAlign: 'left',
          transition: 'background 0.2s',
        }}
      >
        <div className="text-mono-sm" style={{ opacity: 0.55, marginBottom: 8 }}>
          {flipped ? 'REVERSO' : 'FRENTE'} · click para girar
        </div>
        {flipped ? card.back : card.front}
      </button>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <button className="btn btn-ghost" disabled={index === 0} onClick={() => go(-1)}>← Anterior</button>
        <button className="btn btn-ghost" disabled={index === cards.length - 1} onClick={() => go(1)}>Siguiente →</button>
      </div>
    </div>
  );
}
