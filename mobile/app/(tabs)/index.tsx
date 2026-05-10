// Dashboard mobile
import * as React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Colors, Spacing, Radius } from '../../constants/Colors';
import { Fonts, TextStyles } from '../../constants/Typography';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import AbstractArt from '../../components/AbstractArt';

type Course = { id: string; name: string; code?: string | null; status: string };
type Material = { id: string; filename?: string; status: string; created_at?: string; type: string; course_id: string; duration_seconds?: number | null };
type Eval = { id: string; title: string; due_date: string; course_id: string };

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [materials, setMaterials] = React.useState<Material[]>([]);
  const [evals, setEvals] = React.useState<Eval[]>([]);
  const [stats, setStats] = React.useState({ tips: 0, refs: 0, qa: 0 });
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [cs, ms, evs] = await Promise.all([
        api.get<Course[]>('/courses'),
        api.get<Material[]>('/materials?limit=20'),
        api.get<Eval[]>('/evaluations/upcoming').catch(() => []),
      ]);
      setCourses(cs.filter(c => c.status !== 'deleted'));
      setMaterials(ms);
      setEvals(evs);

      const tipResults = await Promise.all(cs.map(c => api.get<any[]>(`/courses/${c.id}/exam-tips`).catch(() => [])));
      const refResults = await Promise.all(cs.map(c => api.get<any[]>(`/courses/${c.id}/references`).catch(() => [])));
      const qaResults = await Promise.all(cs.map(c => api.get<any[]>(`/courses/${c.id}/qa`).catch(() => [])));
      setStats({
        tips: tipResults.flat().length,
        refs: refResults.flat().length,
        qa: qaResults.flat().length,
      });
    } catch (e) {
      console.warn('dashboard load', e);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const ready = materials.filter(m => m.status === 'ready');
  const processing = materials.filter(m => ['pending', 'downloading', 'transcribing', 'extracting'].includes(m.status));
  const nextEval = evals[0];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.orange} />}
    >
      <Text style={[TextStyles.monoSm, { color: Colors.muted, marginBottom: Spacing.xs }]}>HOLA</Text>
      <Text style={[TextStyles.display, { color: Colors.text, marginBottom: Spacing.xxl }]}>
        {user?.name || user?.email || '—'}
      </Text>

      <View style={styles.heroCard}>
        <LinearGradient colors={['#FF4D1C', '#B33312', '#4d1808']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Text style={styles.heroLabel}>CLASES PROCESADAS</Text>
        <Text style={styles.heroNumber}>{String(ready.length).padStart(2, '0')}</Text>
        <Text style={styles.heroSub}>{processing.length > 0 ? `${processing.length} procesando` : 'al día'}</Text>
      </View>

      <View style={styles.statRow}>
        <StatMini label="Tips" value={stats.tips} />
        <StatMini label="Refs" value={stats.refs} />
        <StatMini label="Q&A"  value={stats.qa} />
      </View>

      <SectionHeader title="Próxima evaluación" />
      {nextEval
        ? <NextEvalCard ev={nextEval} courses={courses} onPress={() => router.push(`/course/${nextEval.course_id}`)} />
        : <Text style={[TextStyles.body, { color: Colors.muted }]}>No hay evaluaciones próximas.</Text>}

      <SectionHeader title="Últimas clases" />
      {ready.length === 0 && (
        <Text style={[TextStyles.body, { color: Colors.muted }]}>
          Aún no hay clases procesadas. Subí una grabación desde el detalle de la materia.
        </Text>
      )}
      {ready.slice(0, 8).map((m) => (
        <Pressable
          key={m.id}
          onPress={() => router.push(`/course/${m.course_id}`)}
          style={styles.classCard}
        >
          <View style={styles.artStrip}>
            <AbstractArt courseCode={courses.find(c => c.id === m.course_id)?.code} width={80} height={84} />
          </View>
          <View style={{ flex: 1, padding: Spacing.lg }}>
            <Text style={[TextStyles.title, { color: Colors.text }]} numberOfLines={1}>
              {m.filename || 'Sin título'}
            </Text>
            <Text style={[TextStyles.small, { color: Colors.muted, marginTop: 4 }]}>
              {m.created_at?.slice(0, 10)} · {m.type}{m.duration_seconds ? ` · ${Math.round(m.duration_seconds / 60)} min` : ''}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statMini}>
      <Text style={[TextStyles.monoSm, { color: Colors.muted }]}>{label}</Text>
      <Text style={[TextStyles.display, { color: Colors.text, fontSize: 28, marginTop: 2 }]}>
        {String(value).padStart(2, '0')}
      </Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={{ marginTop: Spacing.xxl, marginBottom: Spacing.md }}>
      <Text style={[TextStyles.display, { color: Colors.text, fontSize: 20 }]}>{title}</Text>
    </View>
  );
}

function NextEvalCard({ ev, courses, onPress }: { ev: Eval; courses: Course[]; onPress: () => void }) {
  const days = Math.max(0, Math.ceil((new Date(ev.due_date).getTime() - Date.now()) / (24 * 3600 * 1000)));
  const course = courses.find(c => c.id === ev.course_id);
  return (
    <Pressable onPress={onPress} style={styles.evalBanner}>
      <LinearGradient colors={['#1d0c08', '#2a1208', '#110505']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <Text style={[TextStyles.monoSm, { color: Colors.orange2 }]}>EN {days} DÍAS</Text>
      <Text style={[TextStyles.hero, { color: Colors.text, marginVertical: Spacing.xs }]}>{days}</Text>
      <Text style={[TextStyles.body, { color: Colors.text }]}>{ev.title}</Text>
      {course && <Text style={[TextStyles.small, { color: Colors.muted }]}>{course.name}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  heroLabel: { fontFamily: Fonts.monoBold, fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.85)' },
  heroNumber: { fontFamily: Fonts.display, fontSize: 56, color: '#fff', lineHeight: 56, marginTop: 6 },
  heroSub: { fontFamily: Fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  statRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  statMini: {
    flex: 1,
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  evalBanner: {
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    overflow: 'hidden',
    borderColor: Colors.border2,
    borderWidth: 1,
  },
  classCard: {
    flexDirection: 'row',
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  artStrip: {
    width: 80,
    backgroundColor: Colors.bg3,
  },
});
