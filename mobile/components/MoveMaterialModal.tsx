// Modal para mover un material a otro módulo del mismo curso.
// Incluye opción "Crear módulo nuevo" inline para no tener que salir.

import * as React from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, SafeAreaView,
} from 'react-native';

import { api } from '../lib/api';
import { Colors, Spacing, Radius } from '../constants/Colors';

type Module = { id: string; name: string; week_number?: number | null };
type Material = { id: string; module_id: string | null; filename: string | null };

export default function MoveMaterialModal({
  material, modules, courseId, onClose, onMoved,
}: {
  material: Material;
  modules: Module[];
  courseId: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [target, setTarget] = React.useState<string>(material.module_id || '');
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      let destId = target;
      if (creating) {
        if (!newName.trim()) { setError('Ponele un nombre al módulo'); setBusy(false); return; }
        const nextWeek = (modules.reduce((m, x) => Math.max(m, x.week_number || 0), 0) || 0) + 1;
        const created = await api.post<Module>(`/courses/${courseId}/modules`, {
          name: newName.trim(),
          week_number: nextWeek,
        });
        destId = created.id;
      }
      if (destId === material.module_id) { onClose(); return; }
      await api.patch(`/materials/${material.id}`, { module_id: destId });
      onMoved();
    } catch (e: any) {
      setError(e?.body?.detail || `Error ${e?.status || ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
            <Text style={styles.title}>Mover material</Text>
            <Text style={styles.filename} numberOfLines={2}>{material.filename}</Text>

            {!creating ? (
              <>
                <Text style={styles.label}>MÓDULO DESTINO</Text>
                <ScrollView style={styles.modList} nestedScrollEnabled>
                  {modules.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setTarget(m.id)}
                      style={[styles.modItem, target === m.id && styles.modItemSelected]}
                    >
                      <Text style={{ color: Colors.text }}>
                        {m.name}{m.id === material.module_id ? ' (actual)' : ''}
                      </Text>
                      {target === m.id && <Text style={{ color: Colors.orange }}>✓</Text>}
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => { setCreating(true); }}
                    style={[styles.modItem, { borderColor: Colors.orange, borderStyle: 'dashed' }]}
                  >
                    <Text style={{ color: Colors.orange }}>+ Crear módulo nuevo…</Text>
                  </Pressable>
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.label}>NOMBRE DEL MÓDULO NUEVO</Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Ej: Semana 3 — Criptografía"
                  placeholderTextColor={Colors.muted2}
                  style={styles.input}
                  autoFocus
                />
                <Pressable onPress={() => { setCreating(false); setNewName(''); }}>
                  <Text style={styles.linkText}>← elegir un módulo existente</Text>
                </Pressable>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.ghostBtn}>
                <Text style={{ color: Colors.muted, fontSize: 13 }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={busy}
                style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              >
                {busy
                  ? <ActivityIndicator color="#0E0E10" size="small" />
                  : <Text style={styles.primaryBtnText}>Mover</Text>}
              </Pressable>
            </View>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: Colors.bg2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    padding: Spacing.lg,
    maxHeight: '85%',
  },
  title: { color: Colors.text, fontSize: 17, fontWeight: '600', marginBottom: 4 },
  filename: { color: Colors.muted, fontSize: 12, marginBottom: Spacing.lg },
  label: { color: Colors.muted, fontSize: 10, letterSpacing: 1, marginBottom: 6 },
  modList: { maxHeight: 320, marginBottom: 12 },
  modItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, borderRadius: Radius.md,
    backgroundColor: Colors.bg3,
    borderColor: Colors.border, borderWidth: 1,
    marginBottom: 6,
  },
  modItemSelected: { borderColor: Colors.orange, backgroundColor: Colors.bg4 },

  input: {
    backgroundColor: Colors.bg3, borderColor: Colors.border2, borderWidth: 1,
    borderRadius: Radius.md, padding: 12,
    color: Colors.text, fontSize: 14, marginBottom: 8,
  },
  linkText: { color: Colors.orange, fontSize: 12, textDecorationLine: 'underline', marginTop: 4 },

  error: { color: '#EF4444', fontSize: 13, marginTop: 8 },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: Spacing.lg },
  ghostBtn: { paddingVertical: 11, paddingHorizontal: 14 },
  primaryBtn: {
    backgroundColor: Colors.orange,
    paddingVertical: 11, paddingHorizontal: 22,
    borderRadius: Radius.md,
    minWidth: 100, alignItems: 'center',
  },
  primaryBtnText: { color: '#0E0E10', fontWeight: '600', fontSize: 14 },
});
