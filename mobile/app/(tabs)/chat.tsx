import * as React from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../../lib/api';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import { Fonts, TextStyles } from '../../constants/Typography';

type Course = { id: string; name: string; code?: string | null };
type Source = { module_name?: string; course_name?: string; similarity?: number | null; excerpt?: string; kind?: 'retrieved' | 'pinned' };
type Message = { role: 'user' | 'assistant'; content: string; sources?: Source[]; mode?: string };

const MODES = [
  { key: 'explain',     label: 'Explicar' },
  { key: 'quiz',        label: 'Quiz' },
  { key: 'flashcards',  label: 'Flashcards' },
  { key: 'exam_prep',   label: 'Examen' },
] as const;

type Mode = typeof MODES[number]['key'];

export default function ChatScreen() {
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [courseId, setCourseId] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [mode, setMode] = React.useState<Mode>('explain');
  const [busy, setBusy] = React.useState(false);
  const scrollerRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    api.get<Course[]>('/courses').then((cs) => setCourses(cs)).catch(() => {});
  }, []);

  // Reset cuando cambia el scope
  React.useEffect(() => {
    setMessages([]);
    setConversationId(null);
  }, [courseId]);

  React.useEffect(() => {
    setTimeout(() => scrollerRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    try {
      const r = await api.post<any>('/chat', {
        query: q, conversation_id: conversationId, course_id: courseId, module_id: null, mode,
      });
      setConversationId(r.conversation_id);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: typeof r.answer === 'string' ? r.answer : JSON.stringify(r.answer, null, 2),
        sources: r.sources, mode: r.mode,
      }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Error: ${e?.body?.detail || e?.status || e?.message}`,
      }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.scopeBar}>
        <Pressable
          onPress={() => setCourseId(null)}
          style={[styles.scopePill, !courseId && styles.scopePillActive]}
        >
          <Text style={[styles.scopeText, !courseId && { color: Colors.text }]}>Todas</Text>
        </Pressable>
        {courses.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCourseId(c.id)}
            style={[styles.scopePill, courseId === c.id && styles.scopePillActive]}
          >
            <Text style={[styles.scopeText, courseId === c.id && { color: Colors.text }]} numberOfLines={1}>
              {c.code || c.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setMode(m.key)}
            style={[styles.modePill, mode === m.key && { backgroundColor: `${Colors.orange}33` }]}
          >
            <Text style={{ color: mode === m.key ? Colors.orange : Colors.muted, fontFamily: Fonts.bodyMedium, fontSize: 12 }}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        ref={scrollerRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxxl }}
      >
        {messages.length === 0 && (
          <Text style={[TextStyles.body, { color: Colors.muted, textAlign: 'center', marginTop: 40 }]}>
            Hacé una pregunta. El modo <Text style={{ color: Colors.text, fontFamily: Fonts.bodySemibold }}>Examen</Text> usa también todos los exam tips del curso como contexto.
          </Text>
        )}

        {messages.map((m, i) => (
          <View key={i} style={{ marginBottom: Spacing.md, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <View style={[
              styles.bubble,
              m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
            ]}>
              <Text style={{
                color: m.role === 'user' ? '#fff' : Colors.text,
                fontFamily: Fonts.body, fontSize: 14, lineHeight: 21,
              }}>
                {m.content}
              </Text>

              {m.sources && m.sources.length > 0 && (
                <View style={styles.sourcesBox}>
                  <Text style={[TextStyles.monoSm, { color: 'rgba(255,255,255,0.7)', marginBottom: 6 }]}>FUENTES</Text>
                  {m.sources.slice(0, 4).map((s, j) => (
                    <Text key={j} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginBottom: 3 }}>
                      {s.kind === 'pinned' ? '📌 ' : '◇ '}
                      {s.module_name || s.course_name || '—'}
                      {s.similarity != null ? ` · ${(s.similarity * 100).toFixed(0)}%` : ''}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Preguntá lo que quieras…"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          multiline
        />
        <Pressable onPress={send} disabled={!input.trim() || busy} style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scopeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  scopePill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg2,
  },
  scopePillActive: { backgroundColor: Colors.bg3 },
  scopeText: { color: Colors.muted, fontFamily: Fonts.bodyMedium, fontSize: 11 },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
  },
  modePill: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg2,
  },
  bubble: {
    maxWidth: '82%',
    padding: 12, borderRadius: 14,
  },
  bubbleUser: { backgroundColor: Colors.orange },
  bubbleAssistant: { backgroundColor: Colors.bg3 },
  sourcesBox: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.bg3,
    borderColor: Colors.border2,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: 14,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
  },
});
