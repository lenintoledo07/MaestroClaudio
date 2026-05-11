// Modal full-screen para ver un signal y profundizar con chat embebido.
// El initialQuery pre-cargado le dice a Claude "profundizá este tip; si no
// hay info en mis materiales completá con tu conocimiento general".

import * as React from 'react';
import {
  Modal, View, Text, ScrollView, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView,
} from 'react-native';

import { api } from '../lib/api';
import { Colors, Spacing, Radius } from '../constants/Colors';
import { TextStyles } from '../constants/Typography';

type Signal = {
  id: string;
  type: string;
  content: string;
  importance: 'high' | 'medium' | 'low';
  context: string | null;
  course_id: string;
  course_name: string;
  module_name: string | null;
  week_number: number | null;
  material_id: string | null;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ module_name?: string | null; course_name?: string | null; similarity?: number | null; kind?: string }>;
};

const IMPORTANCE_LABEL: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const IMPORTANCE_COLOR: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: Colors.muted };
const KIND_LABEL: Record<string, string> = { exam_tip: 'Exam Tip', reference: 'Referencia', qa: 'Q&A' };

export default function SignalDetailModal({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const kindLabel = KIND_LABEL[signal.type] || signal.type;
  const initialQuery = (
    `Profundizá este ${kindLabel.toLowerCase()} de mi clase: "${signal.content}". ` +
    `Si no tenés información suficiente en mis materiales, completalo con tu ` +
    `conocimiento general (marcando claramente qué viene de afuera).`
  );

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState(initialQuery);
  const [busy, setBusy] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const scrollerRef = React.useRef<ScrollView>(null);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    try {
      const r = await api.post<any>('/chat', {
        query: q,
        conversation_id: conversationId,
        course_id: signal.course_id,
        mode: 'explain',
      });
      setConversationId(r.conversation_id);
      setMessages(prev => [...prev, { role: 'assistant', content: r.answer, sources: r.sources }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.body?.detail || e?.status}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollerRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <Modal animationType="slide" transparent={false} visible onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header con metadata y close */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.headerBadgeRow}>
                <View style={[styles.kindBadge, { backgroundColor: IMPORTANCE_COLOR[signal.importance] }]}>
                  <Text style={styles.kindBadgeText}>
                    {kindLabel.toUpperCase()} · {IMPORTANCE_LABEL[signal.importance]}
                  </Text>
                </View>
              </View>
              <Text style={styles.signalContent}>{signal.content}</Text>
              {signal.context && <Text style={styles.signalContext}>↳ {signal.context}</Text>}
              <Text style={styles.signalMeta}>
                {signal.course_name}
                {signal.module_name && ` · ${signal.module_name}`}
                {signal.week_number != null && ` · sem ${signal.week_number}`}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>×</Text>
            </Pressable>
          </View>

          {/* Chat */}
          <View style={styles.chatSectionLabel}>
            <Text style={styles.chatSectionLabelText}>PROFUNDIZÁ CON MAESTRO CLAUDIO</Text>
          </View>
          <ScrollView ref={scrollerRef} style={styles.messages} contentContainerStyle={{ padding: Spacing.md }}>
            {messages.length === 0 && (
              <Text style={styles.emptyChat}>
                Editá la pregunta si querés y tocá Enviar.
              </Text>
            )}
            {messages.map((m, i) => (
              <View key={i} style={[styles.msgWrap, { alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }]}>
                <View
                  style={[
                    styles.msgBubble,
                    m.role === 'user'
                      ? { backgroundColor: Colors.orange, borderColor: Colors.orange }
                      : { backgroundColor: Colors.bg2, borderColor: Colors.border },
                  ]}
                >
                  <Text style={[styles.msgText, m.role === 'user' && { color: '#0E0E10' }]}>{m.content}</Text>
                  {m.sources && m.sources.length > 0 && (
                    <View style={styles.sourcesBox}>
                      <Text style={styles.sourcesLabel}>FUENTES</Text>
                      {m.sources.slice(0, 4).map((s, j) => (
                        <Text key={j} style={styles.sourceItem}>
                          {s.kind === 'pinned' ? '📌 ' : '◇ '}
                          {s.module_name || s.course_name || '—'}
                          {s.similarity != null && ` · ${Math.round((s.similarity as number) * 100)}%`}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ))}
            {busy && (
              <ActivityIndicator color={Colors.orange} style={{ marginTop: 12 }} />
            )}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputBar}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Preguntá algo..."
              placeholderTextColor={Colors.muted2}
              style={styles.input}
              multiline
              editable={!busy}
            />
            <Pressable
              onPress={send}
              disabled={busy || !input.trim()}
              style={[styles.sendBtn, (busy || !input.trim()) && { opacity: 0.5 }]}
            >
              <Text style={styles.sendBtnText}>{busy ? '…' : '↑'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBadgeRow: { flexDirection: 'row', marginBottom: 10 },
  kindBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  kindBadgeText: { color: '#0E0E10', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  signalContent: { color: Colors.text, fontSize: 16, lineHeight: 22 },
  signalContext: { color: Colors.muted, fontSize: 12, fontStyle: 'italic', marginTop: 6 },
  signalMeta: { color: Colors.muted, fontSize: 11, marginTop: 8 },

  closeBtn: { padding: 4 },
  closeBtnText: { color: Colors.muted, fontSize: 26, lineHeight: 26 },

  chatSectionLabel: { padding: Spacing.md, paddingBottom: 0 },
  chatSectionLabelText: { color: Colors.muted, fontSize: 10, letterSpacing: 1, fontFamily: TextStyles.monoSm.fontFamily },

  messages: { flex: 1 },
  emptyChat: { color: Colors.muted, textAlign: 'center', marginTop: 16, fontSize: 12 },
  msgWrap: { marginBottom: 10 },
  msgBubble: {
    maxWidth: '85%',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  msgText: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  sourcesBox: {
    marginTop: 8, paddingTop: 6,
    borderTopColor: 'rgba(255,255,255,0.15)', borderTopWidth: 1,
  },
  sourcesLabel: { color: Colors.muted, fontSize: 9, letterSpacing: 0.5, marginBottom: 3 },
  sourceItem: { color: Colors.muted, fontSize: 10, marginBottom: 2 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: Spacing.md, gap: 8,
    borderTopColor: Colors.border, borderTopWidth: 1,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: Colors.bg3,
    borderColor: Colors.border2, borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 8,
    color: Colors.text, fontSize: 14,
  },
  sendBtn: {
    width: 40, height: 40,
    backgroundColor: Colors.orange,
    borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: '#0E0E10', fontSize: 18, fontWeight: '700' },
});
