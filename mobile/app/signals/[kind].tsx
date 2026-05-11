// Lista cross-course de signals (exam_tip / reference / qa) agrupada por
// curso y módulo. Click en un signal abre el modal SignalDetail con chat
// embebido para profundizar el tema.

import * as React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { api } from '../../lib/api';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import { TextStyles } from '../../constants/Typography';
import SignalDetailModal from '../../components/SignalDetailModal';

type Signal = {
  id: string;
  content: string;
  importance: 'high' | 'medium' | 'low';
  timestamp_seconds: number | null;
  type: string;
  speaker: 'professor' | 'student' | 'unknown' | null;
  context: string | null;
  material_id: string;
  module_id: string | null;
  course_id: string;
  course_name: string;
  course_code: string | null;
  course_color: string | null;
  module_name: string | null;
  week_number: number | null;
  material_filename: string | null;
};

const KIND_CONFIG: Record<string, { type: string; title: string; icon: string; empty: string }> = {
  'exam-tips':  { type: 'exam_tip',  title: 'Exam Tips',   icon: '📌', empty: 'Todavía no hay exam tips. Procesá una clase para verlos.' },
  'references': { type: 'reference', title: 'Referencias', icon: '◇', empty: 'Sin referencias todavía. Aparecen libros, papers y normas mencionados en las clases.' },
  'qa':         { type: 'qa',        title: 'Q&A',         icon: '?', empty: 'No hay Q&A todavía. Se acumulan las preguntas hechas en clase con su respuesta.' },
};

const IMPORTANCE_COLOR: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: Colors.muted,
};

export default function SignalsScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const config = kind ? KIND_CONFIG[kind] : undefined;

  const [signals, setSignals] = React.useState<Signal[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Signal | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!config) return;
    try {
      const r = await api.get<Signal[]>(`/signals?type=${config.type}`);
      setSignals(r);
      setError(null);
    } catch (e: any) {
      setError(e?.body?.detail || `Error ${e?.status || ''}`);
    }
  }, [config]);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!config) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Signals' }} />
        <Text style={styles.error}>Tipo de signal desconocido: {kind}</Text>
      </View>
    );
  }

  // Agrupar por curso → módulo
  const grouped = React.useMemo(() => {
    if (!signals) return [];
    const byCourse = new Map<string, { course: Pick<Signal, 'course_id' | 'course_name' | 'course_code' | 'course_color'>; modules: Map<string, { module_id: string | null; module_name: string | null; week: number | null; items: Signal[] }> }>();
    for (const s of signals) {
      if (!byCourse.has(s.course_id)) {
        byCourse.set(s.course_id, {
          course: { course_id: s.course_id, course_name: s.course_name, course_code: s.course_code, course_color: s.course_color },
          modules: new Map(),
        });
      }
      const c = byCourse.get(s.course_id)!;
      const modKey = s.module_id || 'none';
      if (!c.modules.has(modKey)) {
        c.modules.set(modKey, { module_id: s.module_id, module_name: s.module_name, week: s.week_number, items: [] });
      }
      c.modules.get(modKey)!.items.push(s);
    }
    return Array.from(byCourse.values()).map(g => ({
      ...g.course,
      modules: Array.from(g.modules.values()),
    }));
  }, [signals]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `${config.icon} ${config.title}` }} />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxxl }}
        refreshControl={<RefreshControl tintColor={Colors.orange} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {signals === null && !error && <ActivityIndicator color={Colors.orange} style={{ marginTop: 32 }} />}
        {error && <Text style={styles.error}>{error}</Text>}

        {signals !== null && signals.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{config.empty}</Text>
          </View>
        )}

        {grouped.map((g) => (
          <View key={g.course_id} style={{ marginBottom: Spacing.xxl }}>
            <View style={styles.courseHeader}>
              <View style={[styles.colorDot, { backgroundColor: g.course_color || Colors.muted }]} />
              <Text style={styles.courseTitle}>{g.course_name}</Text>
              {g.course_code && <Text style={styles.courseCode}>{g.course_code}</Text>}
            </View>
            {g.modules.map((mod) => (
              <View key={mod.module_id || 'none'} style={styles.moduleCard}>
                <Text style={styles.moduleTitle}>
                  {mod.module_name || '— sin módulo —'}
                  {mod.week != null && ` · semana ${mod.week}`}
                </Text>
                {mod.items.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelected(s)}
                    style={[
                      styles.signalItem,
                      { borderLeftColor: IMPORTANCE_COLOR[s.importance] || Colors.muted },
                    ]}
                  >
                    {kind === 'qa' && s.speaker && (
                      <Text style={styles.speakerTag}>
                        [{s.speaker === 'professor' ? 'PROF' : s.speaker === 'student' ? 'ALUMNO' : '?'}]
                      </Text>
                    )}
                    <Text style={styles.signalContent}>{s.content}</Text>
                    {s.context && <Text style={styles.signalContext}>↳ {s.context}</Text>}
                    {s.timestamp_seconds != null && (
                      <Text style={styles.signalMeta}>
                        {formatTime(s.timestamp_seconds)}{s.material_filename ? ` · ${s.material_filename}` : ''}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {selected && (
        <SignalDetailModal signal={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  error: { color: '#EF4444', padding: Spacing.lg },

  courseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  courseTitle: { color: Colors.text, fontSize: 17, fontWeight: '600' },
  courseCode: { color: Colors.muted, fontSize: 11, marginLeft: 4 },

  moduleCard: {
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  moduleTitle: { color: Colors.muted, fontSize: 11, letterSpacing: 0.8, marginBottom: Spacing.md, fontFamily: TextStyles.monoSm.fontFamily },

  signalItem: {
    backgroundColor: Colors.bg3,
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 6,
  },
  speakerTag: { color: Colors.muted, fontSize: 10, marginBottom: 4, letterSpacing: 0.5 },
  signalContent: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  signalContext: { color: Colors.muted, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  signalMeta: { color: Colors.muted2, fontSize: 11, marginTop: 4 },

  emptyCard: {
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.xxl,
  },
  emptyText: { color: Colors.muted, lineHeight: 20, textAlign: 'center' },
});
