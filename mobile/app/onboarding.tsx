// Wizard de onboarding post-login. Espejo del web (Drive folder → Materias →
// Calendar → Done). Sin esto, el user no puede usar la app porque
// `drive_folder_id` queda null y el resto del flow depende de eso.

import * as React from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Colors, Spacing, Radius } from '../constants/Colors';

const STEPS = ['Drive', 'Materias', 'Calendario', 'Listo'];
const COLORS_PALETTE = [
  '#818CF8', '#A78BFA', '#67E8F9', '#86EFAC', '#FCD34D', '#F87171', '#FB923C',
];

type DriveFolder = { id: string; name: string };
type Course = { id: string; name: string; drive_folder_id?: string | null; status?: string };
type SyncResult = { synced?: number; new?: number; updated?: number };

export default function OnboardingScreen() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    // Si ya tiene drive_folder_id, saltar el paso 1.
    if (user?.drive_folder_id && step === 0) setStep(1);
  }, [user?.drive_folder_id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const finish = async () => {
    await refresh();
    router.replace('/(tabs)' as any);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Stepper step={step} />
        {step === 0 && <DriveStep onDone={next} />}
        {step === 1 && <CoursesStep onDone={next} />}
        {step === 2 && <CalendarStep onDone={next} />}
        {step === 3 && <DoneStep onFinish={finish} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <View style={styles.stepperRow}>
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                { backgroundColor: i <= step ? Colors.orange : Colors.bg3 },
              ]}
            >
              <Text
                style={[
                  styles.stepNum,
                  { color: i <= step ? '#fff' : Colors.muted },
                ]}
              >
                {i < step ? '✓' : i + 1}
              </Text>
            </View>
            <Text style={[styles.stepLabel, { color: i === step ? Colors.text : Colors.muted }]}>
              {label}
            </Text>
          </View>
          {i < STEPS.length - 1 && <View style={styles.stepLine} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Step 0: Drive folder ──────────────────────────────────────────────────

function DriveStep({ onDone }: { onDone: () => void }) {
  const [folders, setFolders] = React.useState<DriveFolder[] | null>(null);
  const [selected, setSelected] = React.useState<string>('');
  const [manualMode, setManualMode] = React.useState(false);
  const [manualInput, setManualInput] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.get<DriveFolder[]>('/users/me/drive/folders?parent_id=root')
      .then(setFolders)
      .catch((e) => setError(e?.body?.detail || 'No pude listar tu Drive'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const value = manualMode ? manualInput.trim() : selected;
    if (!value) { setError('Elegí una carpeta'); return; }
    setSaving(true); setError(null);
    try {
      await api.patch('/users/me', { drive_folder_id: value });
      onDone();
    } catch (e: any) {
      setError(e?.body?.detail || `Error ${e?.status || ''}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.h2}>Conectá tu carpeta de Drive</Text>
      <Text style={styles.muted}>
        Elegí la carpeta donde tenés organizado tu Master (con subcarpetas por
        materia). Después podés elegir la subcarpeta de cada materia.
      </Text>

      {!manualMode ? (
        <>
          {loading && <ActivityIndicator color={Colors.orange} style={{ marginTop: 16 }} />}
          {!loading && folders && folders.length === 0 && (
            <Text style={styles.mutedSmall}>
              No encontré carpetas top-level en tu Drive. Pegá link manualmente abajo.
            </Text>
          )}
          {!loading && folders && folders.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>CARPETA RAÍZ</Text>
              <ScrollView style={styles.folderList} nestedScrollEnabled>
                {folders.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => setSelected(f.id)}
                    style={[
                      styles.folderItem,
                      selected === f.id && styles.folderItemSelected,
                    ]}
                  >
                    <Text style={{ color: Colors.text }}>{f.name}</Text>
                    {selected === f.id && <Text style={{ color: Colors.orange }}>✓</Text>}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          <Pressable onPress={() => setManualMode(true)}>
            <Text style={styles.linkText}>¿No la ves? Pegar link manualmente</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>LINK O ID</Text>
          <TextInput
            value={manualInput}
            onChangeText={setManualInput}
            placeholder="https://drive.google.com/drive/folders/1ABC..."
            placeholderTextColor={Colors.muted2}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={() => setManualMode(false)}>
            <Text style={styles.linkText}>← Volver a la lista</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        onPress={save}
        disabled={saving}
        style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
      >
        <Text style={styles.primaryBtnText}>
          {saving ? 'Verificando…' : 'Continuar'}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Step 1: Materias ──────────────────────────────────────────────────────

function CoursesStep({ onDone }: { onDone: () => void }) {
  const [folders, setFolders] = React.useState<DriveFolder[] | null>(null);
  const [existing, setExisting] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [result, setResult] = React.useState<{ count: number; errors: string[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      api.get<DriveFolder[]>('/users/me/drive/folders'),
      api.get<Course[]>('/courses').catch(() => []),
    ])
      .then(([fs, cs]) => {
        const used = new Set(cs.filter(c => c.status !== 'deleted').map(c => c.drive_folder_id).filter(Boolean) as string[]);
        setExisting(used);
        setFolders(fs);
        setSelected(Object.fromEntries(fs.map(f => [f.id, !used.has(f.id)])));
      })
      .catch((e: any) => setError(e?.body?.detail || 'No pude listar las subcarpetas'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const createAll = async () => {
    if (!folders) return;
    const toCreate = folders.filter(f => selected[f.id] && !existing.has(f.id));
    setCreating(true);
    let count = 0;
    const errors: string[] = [];
    for (let i = 0; i < toCreate.length; i++) {
      const f = toCreate[i];
      try {
        await api.post('/courses', {
          name: f.name,
          drive_folder_id: f.id,
          color: COLORS_PALETTE[i % COLORS_PALETTE.length],
        });
        count++;
      } catch (e: any) {
        errors.push(`${f.name}: ${e?.body?.detail || e?.status}`);
      }
    }
    setResult({ count, errors });
    setCreating(false);
  };

  return (
    <View>
      <Text style={styles.h2}>Importá tus materias</Text>
      <Text style={styles.muted}>
        Encontré estas subcarpetas en tu Drive. Cada una se va a crear como una
        materia con su carpeta linkeada. Después podés importar los archivos.
      </Text>

      {loading && <ActivityIndicator color={Colors.orange} style={{ marginTop: 16 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {folders && folders.length === 0 && (
        <Text style={styles.mutedSmall}>
          No encontré subcarpetas dentro de tu carpeta raíz. Podés crear las materias después desde el Dashboard.
        </Text>
      )}

      {folders && folders.length > 0 && !result && (
        <View style={{ marginTop: 12 }}>
          {folders.map((f, i) => {
            const isExisting = existing.has(f.id);
            return (
              <Pressable
                key={f.id}
                onPress={() => !isExisting && toggle(f.id)}
                style={[
                  styles.courseRow,
                  isExisting && { opacity: 0.5 },
                ]}
                disabled={isExisting}
              >
                <View style={[styles.checkbox, selected[f.id] && styles.checkboxOn]}>
                  {selected[f.id] && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                </View>
                <View style={[styles.colorDot, { backgroundColor: COLORS_PALETTE[i % COLORS_PALETTE.length] }]} />
                <Text style={[styles.courseName, { flex: 1 }]}>{f.name}</Text>
                {isExisting && <Text style={styles.mutedSmall}>ya existe</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {result && (
        <View style={styles.resultCard}>
          <Text style={{ color: Colors.orange, marginBottom: 6 }}>
            ✓ {result.count} {result.count === 1 ? 'materia creada' : 'materias creadas'}
          </Text>
          {result.errors.length > 0 && (
            <>
              <Text style={[styles.mutedSmall, { color: '#EF4444' }]}>{result.errors.length} fallaron:</Text>
              {result.errors.map((e, i) => (
                <Text key={i} style={styles.mutedSmall}>• {e}</Text>
              ))}
            </>
          )}
          <Text style={[styles.mutedSmall, { marginTop: 10 }]}>
            Entrá a cada materia desde el dashboard para importar sus videos.
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <Pressable onPress={onDone} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>Saltar</Text>
        </Pressable>
        {!result ? (
          <Pressable
            onPress={createAll}
            disabled={creating || !folders || selectedCount === 0}
            style={[styles.primaryBtn, { flex: 1, marginLeft: 8 }, (creating || selectedCount === 0) && { opacity: 0.6 }]}
          >
            <Text style={styles.primaryBtnText}>
              {creating ? 'Creando…' : `Crear ${selectedCount}`}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={onDone} style={[styles.primaryBtn, { flex: 1, marginLeft: 8 }]}>
            <Text style={styles.primaryBtnText}>Continuar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Step 2: Calendar ──────────────────────────────────────────────────────

function CalendarStep({ onDone }: { onDone: () => void }) {
  const [syncing, setSyncing] = React.useState(false);
  const [result, setResult] = React.useState<SyncResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const sync = async () => {
    setSyncing(true); setError(null);
    try {
      const r = await api.post<SyncResult>('/calendar/sync');
      setResult(r);
    } catch (e: any) {
      setError(e?.body?.detail || `Error ${e?.status || ''}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View>
      <Text style={styles.h2}>Conectá tu calendario</Text>
      <Text style={styles.muted}>
        Maestro busca eventos de tus materias para detectar clases y evaluaciones.
        Sincronizá ahora o saltá y hacelo después desde el dashboard.
      </Text>

      <View style={styles.providerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>Google Calendar</Text>
          <Text style={styles.mutedSmall}>Conectado vía tu login</Text>
        </View>
        <Pressable
          onPress={sync}
          disabled={syncing}
          style={[styles.primaryBtnSmall, syncing && { opacity: 0.6 }]}
        >
          <Text style={styles.primaryBtnText}>
            {syncing ? 'Sync…' : (result ? 'Re-sync' : 'Sincronizar')}
          </Text>
        </Pressable>
      </View>
      {result && (
        <Text style={[styles.mutedSmall, { color: Colors.orange, marginBottom: 8 }]}>
          ✓ {result.synced ?? 0} eventos ({result.new ?? 0} nuevos, {result.updated ?? 0} actualizados)
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={[styles.providerCard, { opacity: 0.5 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>Outlook / Office 365</Text>
          <Text style={styles.mutedSmall}>Próximamente</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Pressable onPress={onDone} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>Saltar</Text>
        </Pressable>
        <Pressable
          onPress={onDone}
          disabled={!result}
          style={[styles.primaryBtn, { flex: 1, marginLeft: 8 }, !result && { opacity: 0.5 }]}
        >
          <Text style={styles.primaryBtnText}>Continuar</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Step 3: Done ──────────────────────────────────────────────────────────

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 20 }}>
      <View style={styles.doneCheck}>
        <Text style={styles.doneCheckText}>✓</Text>
      </View>
      <Text style={[styles.h2, { textAlign: 'center' }]}>¡Listo!</Text>
      <Text style={[styles.muted, { textAlign: 'center', marginBottom: 24 }]}>
        Ya está todo conectado. Para que el chat tenga contexto, entrá a una
        materia desde el dashboard e importá sus videos. El procesamiento corre
        en segundo plano.
      </Text>
      <Pressable onPress={onFinish} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Ir al Dashboard</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxxl,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    flexWrap: 'wrap',
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '600' },
  stepLabel: { fontSize: 11, marginRight: 4 },
  stepLine: { width: 18, height: 1, backgroundColor: Colors.border, marginHorizontal: 4 },

  h2: { fontSize: 22, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  muted: { fontSize: 13, color: Colors.muted, lineHeight: 19, marginBottom: 18 },
  mutedSmall: { fontSize: 12, color: Colors.muted, marginVertical: 4 },
  error: { color: '#EF4444', marginTop: 10, fontSize: 13 },

  field: { marginVertical: 12 },
  label: { fontSize: 10, color: Colors.muted, letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: Colors.bg3,
    borderColor: Colors.border2,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
  },
  folderList: {
    maxHeight: 260,
    backgroundColor: Colors.bg3,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  folderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  folderItemSelected: { backgroundColor: Colors.bg4 },

  linkText: { color: Colors.orange, fontSize: 12, textDecorationLine: 'underline', marginTop: 6 },

  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: Colors.bg3,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    marginBottom: 6,
  },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 1, borderColor: Colors.border2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  courseName: { color: Colors.text, fontSize: 14 },

  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    marginBottom: 10,
  },
  providerName: { color: Colors.text, fontSize: 14, fontWeight: '500' },

  resultCard: {
    padding: 14, marginVertical: 12,
    backgroundColor: Colors.bg2,
    borderColor: Colors.orange, borderWidth: 1,
    borderRadius: Radius.md,
  },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  primaryBtn: {
    backgroundColor: Colors.orange,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryBtnSmall: {
    backgroundColor: Colors.orange,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
  },
  primaryBtnText: { color: '#0E0E10', fontSize: 14, fontWeight: '600' },
  ghostBtn: { paddingVertical: 13, paddingHorizontal: 14 },
  ghostBtnText: { color: Colors.muted, fontSize: 13 },

  doneCheck: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  doneCheckText: { color: '#fff', fontSize: 28, fontWeight: '600' },
});
