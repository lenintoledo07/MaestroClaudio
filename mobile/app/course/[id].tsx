import * as React from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

import { api, API_BASE, getToken } from '../../lib/api';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import { Fonts, TextStyles } from '../../constants/Typography';
import AbstractArt from '../../components/AbstractArt';
import MoveMaterialModal from '../../components/MoveMaterialModal';

type Course = {
  id: string; name: string; code?: string | null; professor?: string | null;
  drive_folder_id?: string | null;
};
type Module = { id: string; name: string; week_number?: number | null };
type Material = {
  id: string; module_id: string; status: string; type: string;
  filename?: string | null; created_at?: string;
  duration_seconds?: number | null; audio_path?: string | null;
};
type DriveFile = {
  id: string; name: string; mime_type: string; type: string;
  size?: number | null; modified_time?: string;
  already_imported: boolean;
};

const STATUS_LABEL: Record<string, { color: string; text: string }> = {
  pending:      { color: Colors.muted,   text: 'En cola' },
  downloading:  { color: Colors.tip,     text: 'Descargando' },
  transcribing: { color: Colors.tip,     text: 'Transcribiendo' },
  extracting:   { color: Colors.tip,     text: 'Extrayendo' },
  ready:        { color: Colors.qa,      text: 'Lista' },
  error:        { color: Colors.pending, text: 'Error' },
};

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = React.useState<Course | null>(null);
  const [modules, setModules] = React.useState<Module[]>([]);
  const [materials, setMaterials] = React.useState<Material[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [showDrive, setShowDrive] = React.useState(false);
  const [driveFiles, setDriveFiles] = React.useState<DriveFile[] | null>(null);
  const [importingId, setImportingId] = React.useState<string | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<Material | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    const [c, mods, mats] = await Promise.all([
      api.get<Course>(`/courses/${id}`),
      api.get<Module[]>(`/courses/${id}/modules`).catch(() => []),
      api.get<Material[]>(`/materials?course_id=${id}`).catch(() => []),
    ]);
    setCourse(c);
    setModules(mods);
    setMaterials(mats);
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const loadDrive = async () => {
    try {
      const f = await api.get<DriveFile[]>(`/courses/${id}/drive/files`);
      setDriveFiles(f);
    } catch (e: any) {
      Alert.alert('Drive', e?.body?.detail || 'No se pudo listar la carpeta');
      setDriveFiles([]);
    }
  };

  const importDriveFile = async (f: DriveFile) => {
    if (modules.length === 0) {
      Alert.alert('Sin semanas', 'Primero creá una semana desde la web.');
      return;
    }
    setImportingId(f.id);
    try {
      await api.post(`/modules/${modules[0].id}/materials/drive`, { drive_file_id: f.id });
      Alert.alert('Importado', 'El procesamiento arrancó. Vas a recibir una push notif cuando termine.');
      await load();
      await loadDrive();
    } catch (e: any) {
      Alert.alert('Error', e?.body?.detail || `HTTP ${e?.status}`);
    } finally {
      setImportingId(null);
    }
  };

  const pickWhatsAppExport = async () => {
    if (modules.length === 0) {
      Alert.alert('Sin semanas', 'Primero creá una semana desde la web.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: 'text/plain' });
    if (result.canceled) return;
    const file = result.assets[0];
    try {
      const fd = new FormData();
      fd.append('file', { uri: file.uri, name: file.name, type: 'text/plain' } as any);
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${API_BASE}/modules/${modules[0].id}/materials/upload`, {
        method: 'POST',
        headers,
        body: fd,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      Alert.alert('Subido', 'Procesando el export.');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Upload falló');
    }
  };

  if (!course) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator color={Colors.orange} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: course.name }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.bg }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.orange} />}
      >
        <View style={{ height: 100, marginBottom: Spacing.lg }}>
          <AbstractArt courseCode={course.code} width={500} height={100} />
        </View>

        <View style={{ paddingHorizontal: Spacing.xl }}>
          <Text style={[TextStyles.small, { color: Colors.muted }]}>
            {course.code || '—'}{course.professor ? ` · ${course.professor}` : ''}
          </Text>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
            {course.drive_folder_id && (
              <Pressable
                onPress={() => { setShowDrive(s => !s); if (!driveFiles) loadDrive(); }}
                style={[styles.actionBtn, { backgroundColor: Colors.bg2 }]}
              >
                <Ionicons name="cloud" size={16} color={Colors.text} />
                <Text style={styles.actionBtnText}>Importar de Drive</Text>
              </Pressable>
            )}
            <Pressable onPress={pickWhatsAppExport} style={[styles.actionBtn, { backgroundColor: Colors.orange }]}>
              <Ionicons name="document-attach" size={16} color="#fff" />
              <Text style={[styles.actionBtnText, { color: '#fff' }]}>Subir .txt</Text>
            </Pressable>
          </View>

          {showDrive && driveFiles && (
            <View style={{ marginTop: Spacing.lg }}>
              <Text style={[TextStyles.title, { color: Colors.text, marginBottom: Spacing.sm }]}>
                Archivos en Drive
              </Text>
              {driveFiles.length === 0 && <Text style={{ color: Colors.muted }}>Carpeta vacía o sin archivos compatibles.</Text>}
              {driveFiles.map((f) => (
                <View key={f.id} style={[styles.driveRow, f.already_imported && { opacity: 0.5 }]}>
                  <Text style={{ color: Colors.muted, fontFamily: Fonts.monoBold, fontSize: 10, width: 38 }}>
                    {f.type.toUpperCase()}
                  </Text>
                  <Text style={{ flex: 1, color: Colors.text, fontFamily: Fonts.body, fontSize: 13 }} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {f.already_imported
                    ? <Text style={{ color: Colors.qa, fontSize: 11 }}>✓ importado</Text>
                    : importingId === f.id
                      ? <ActivityIndicator color={Colors.orange} />
                      : <Pressable onPress={() => importDriveFile(f)} style={styles.importBtn}>
                          <Text style={{ color: '#fff', fontFamily: Fonts.bodyMedium, fontSize: 11 }}>Importar</Text>
                        </Pressable>}
                </View>
              ))}
            </View>
          )}

          <View style={{ marginTop: Spacing.xxl }}>
            <Text style={[TextStyles.display, { color: Colors.text, fontSize: 20, marginBottom: Spacing.md }]}>
              Semanas
            </Text>
            {modules.length === 0 && (
              <Text style={[TextStyles.small, { color: Colors.muted }]}>
                Aún no hay semanas. Creá la primera desde la web.
              </Text>
            )}
            {modules.map((m) => {
              const mats = materials.filter(x => x.module_id === m.id);
              return (
                <View key={m.id} style={styles.moduleCard}>
                  <Text style={[TextStyles.title, { color: Colors.text }]}>{m.name}</Text>
                  <Text style={[TextStyles.small, { color: Colors.muted, marginBottom: Spacing.sm }]}>
                    {mats.length} material{mats.length !== 1 ? 'es' : ''}
                  </Text>
                  {mats.map((mat) => (
                    <MaterialRow
                      key={mat.id}
                      m={mat}
                      onMove={() => setMoveTarget(mat)}
                      onDeleted={load}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {moveTarget && (
        <MoveMaterialModal
          material={moveTarget}
          modules={modules}
          courseId={id as string}
          onClose={() => setMoveTarget(null)}
          onMoved={() => { setMoveTarget(null); load(); }}
        />
      )}
    </>
  );
}

function MaterialRow({ m, onMove, onDeleted }: { m: Material; onMove: () => void; onDeleted: () => void }) {
  const [token, setLocalToken] = React.useState<string | null>(null);
  const status = STATUS_LABEL[m.status] || { color: Colors.muted, text: m.status };

  React.useEffect(() => {
    if (m.audio_path) getToken().then(setLocalToken);
  }, [m.audio_path]);

  const audioSource = m.audio_path && token
    ? { uri: `${API_BASE}/materials/${m.id}/audio`, headers: { Authorization: `Bearer ${token}` } }
    : null;

  const player = useAudioPlayer(audioSource as any);
  const playerStatus = useAudioPlayerStatus(player);
  const playing = playerStatus.playing;

  const togglePlay = () => {
    if (!m.audio_path) {
      Alert.alert('Sin audio', 'Esta clase aún no tiene audio TTS generado.');
      return;
    }
    try {
      if (playing) player.pause();
      else player.play();
    } catch (e: any) {
      Alert.alert('Audio', e?.message || 'No se pudo reproducir');
    }
  };

  return (
    <View style={styles.materialRow}>
      <View style={[styles.statusDot, { backgroundColor: status.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text, fontFamily: Fonts.body, fontSize: 13 }} numberOfLines={1}>
          {m.filename || 'Sin título'}
        </Text>
        <Text style={[TextStyles.small, { color: Colors.muted }]}>
          {status.text}{m.duration_seconds ? ` · ${Math.round(m.duration_seconds / 60)} min` : ''}
        </Text>
      </View>
      {m.status === 'ready' && m.audio_path && (
        <Pressable onPress={togglePlay} style={styles.playBtn}>
          <Ionicons name={playing ? 'pause' : 'play'} size={14} color="#fff" />
        </Pressable>
      )}
      <Pressable onPress={() => openActions(m, onMove, onDeleted)} hitSlop={10} style={styles.menuBtn}>
        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.muted} />
      </Pressable>
    </View>
  );
}

function openActions(m: Material, onMove: () => void, onDeleted: () => void) {
  Alert.alert(
    m.filename || 'Material',
    'Elegí una acción',
    [
      { text: 'Mover a otro módulo', onPress: onMove },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => Alert.alert(
          'Eliminar',
          `Esto borra "${m.filename}" y todo su contenido procesado (signals, chunks, audio).`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Eliminar',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.del(`/materials/${m.id}`);
                  onDeleted();
                } catch (e: any) {
                  Alert.alert('Error', e?.body?.detail || `HTTP ${e?.status || ''}`);
                }
              },
            },
          ],
        ),
      },
      { text: 'Cancelar', style: 'cancel' },
    ],
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderColor: Colors.border2,
    borderWidth: 1,
  },
  actionBtnText: { color: Colors.text, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.bg2,
    borderRadius: Radius.md,
    marginBottom: 6,
  },
  importBtn: {
    backgroundColor: Colors.orange,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  moduleCard: {
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  playBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
  },
  menuBtn: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
});
