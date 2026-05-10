import * as React from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../../lib/api';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import { Fonts, TextStyles } from '../../constants/Typography';
import AbstractArt from '../../components/AbstractArt';

type Course = {
  id: string;
  name: string;
  code?: string | null;
  professor?: string | null;
  status: string;
  drive_folder_id?: string | null;
};

export default function CoursesScreen() {
  const router = useRouter();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [stats, setStats] = React.useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    const cs = await api.get<Course[]>('/courses');
    const visible = cs.filter(c => c.status !== 'deleted');
    setCourses(visible);
    const tipResults = await Promise.all(
      visible.map(c => api.get<any[]>(`/courses/${c.id}/exam-tips`).catch(() => [])),
    );
    const map: Record<string, number> = {};
    visible.forEach((c, i) => { map[c.id] = tipResults[i].length; });
    setStats(map);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const togglePause = async (c: Course) => {
    const next = c.status === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/courses/${c.id}`, { status: next });
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.body?.detail || `HTTP ${e?.status}`);
    }
  };

  const showActions = (c: Course) => {
    Alert.alert(
      c.name,
      'Acciones disponibles',
      [
        { text: c.status === 'active' ? 'Pausar' : 'Reactivar', onPress: () => togglePause(c) },
        { text: 'Marcar completada', onPress: async () => {
            try { await api.patch(`/courses/${c.id}`, { status: 'completed' }); load(); } catch {}
          } },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: Spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.orange} />}
    >
      <Text style={[TextStyles.display, { color: Colors.text, marginBottom: Spacing.xl }]}>
        Mis materias
      </Text>

      {courses.length === 0 && (
        <Text style={[TextStyles.body, { color: Colors.muted, marginTop: Spacing.lg }]}>
          Aún no agregaste materias. Creá la primera desde la web por ahora — el formulario
          mobile llega en la siguiente iteración.
        </Text>
      )}

      {courses.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push(`/course/${c.id}`)}
          onLongPress={() => showActions(c)}
          style={[styles.card, c.status !== 'active' && { opacity: 0.55 }]}
        >
          <View style={styles.artHeader}>
            <AbstractArt courseCode={c.code} width={400} height={90} />
            <View style={styles.driveBadge}>
              {c.drive_folder_id
                ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="cloud-done" size={12} color={Colors.qa} />
                    <Text style={[TextStyles.small, { color: Colors.qa }]}>Drive</Text>
                  </View>
                : <Text style={[TextStyles.small, { color: Colors.muted }]}>sin Drive</Text>}
            </View>
          </View>
          <View style={{ padding: Spacing.lg }}>
            <Text style={[TextStyles.title, { color: Colors.text }]}>{c.name}</Text>
            <Text style={[TextStyles.small, { color: Colors.muted, marginTop: 2 }]}>
              {c.code || '—'}{c.professor ? ` · ${c.professor}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md }}>
              <Tag label={`${stats[c.id] ?? 0} tips`} color={Colors.tip} />
              {c.status !== 'active' && <Tag label={c.status} color={Colors.muted} />}
            </View>
          </View>
        </Pressable>
      ))}

      <Text style={[TextStyles.small, { color: Colors.muted, marginTop: Spacing.xl, textAlign: 'center' }]}>
        Mantén presionada una materia para pausar/completar.
      </Text>
    </ScrollView>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: `${color}22`, paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: Radius.full }}>
      <Text style={{ color, fontFamily: Fonts.bodyMedium, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  artHeader: {
    height: 90,
    position: 'relative',
  },
  driveBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
});
