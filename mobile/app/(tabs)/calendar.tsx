import * as React from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../../lib/api';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import { Fonts, TextStyles } from '../../constants/Typography';

type Event = {
  event_id: string;
  event_date?: string | null;
  start_time?: string | null;
  title?: string;
  material_status: 'missing' | 'partial' | 'complete';
  material_id?: string | null;
  day_label?: string | null;
};

type CourseGroup = {
  course_id: string;
  course_name: string;
  course_code?: string | null;
  course_color?: string | null;
  events: Event[];
};

const STATUS_COLOR: Record<string, string> = {
  missing: Colors.orange,
  partial: Colors.tip,
  complete: Colors.qa,
};

const STATUS_LABEL: Record<string, string> = {
  missing: 'Sin grabación',
  partial: 'Procesando',
  complete: 'Lista',
};

export default function CalendarScreen() {
  const [groups, setGroups] = React.useState<CourseGroup[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const data = await api.get<CourseGroup[]>('/calendar/weekly-status');
      setGroups(data);
    } catch (e) {
      console.warn('weekly-status', e);
      setGroups([]);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ synced: number; new: number; updated: number }>('/calendar/sync');
      Alert.alert('Sync OK', `${r.synced} eventos · ${r.new} nuevos · ${r.updated} actualizados`);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.body?.detail || 'No se pudo sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: Spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.orange} />}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl }}>
        <Text style={[TextStyles.display, { color: Colors.text }]}>Esta semana</Text>
        <Pressable onPress={sync} disabled={syncing} style={styles.syncBtn}>
          <Ionicons name={syncing ? 'sync-circle' : 'sync'} size={16} color={Colors.text} />
          <Text style={{ color: Colors.text, fontFamily: Fonts.bodyMedium, fontSize: 12 }}>
            {syncing ? 'Sincronizando…' : 'Sync'}
          </Text>
        </Pressable>
      </View>

      {groups.length === 0 && (
        <Text style={[TextStyles.body, { color: Colors.muted, lineHeight: 22 }]}>
          No hay clases detectadas esta semana. Asegurate de que el título de tu evento de
          Google Calendar contenga el nombre o código de la materia (ej. "HE-01: Reconocimiento").
        </Text>
      )}

      {groups.map((g) => (
        <View key={g.course_id} style={{ marginBottom: Spacing.xl }}>
          <Text style={[TextStyles.title, { color: Colors.text, marginBottom: Spacing.sm }]}>
            {g.course_name}
          </Text>
          {g.events.map((ev) => (
            <View key={ev.event_id} style={styles.eventCard}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[ev.material_status] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[TextStyles.body, { color: Colors.text }]} numberOfLines={1}>
                  {ev.title || '—'}
                </Text>
                <Text style={[TextStyles.small, { color: Colors.muted, marginTop: 2 }]}>
                  {ev.day_label || ev.event_date} {ev.start_time ? `· ${ev.start_time.slice(0, 5)}` : ''}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLOR[ev.material_status]}22` }]}>
                <Text style={{ color: STATUS_COLOR[ev.material_status], fontFamily: Fonts.bodyMedium, fontSize: 11 }}>
                  {STATUS_LABEL[ev.material_status]}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Colors.bg2,
    borderColor: Colors.border2,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  statusPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
});
