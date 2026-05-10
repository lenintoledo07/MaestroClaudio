import * as React from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  Alert, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../lib/auth';
import { Colors, Spacing, Radius } from '../constants/Colors';
import { Fonts, TextStyles } from '../constants/Typography';

export default function LoginScreen() {
  const { signIn, signInWithToken, request, loading } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [showDevPaste, setShowDevPaste] = React.useState(false);
  const [pastedToken, setPastedToken] = React.useState('');

  const onPress = async () => {
    if (!request) return;
    setBusy(true);
    try { await signIn(); } finally { setBusy(false); }
  };

  // Atajo DEV: pegar el JWT que sale del cookie de la web logueada.
  // En production esto se reemplaza por OAuth nativo (ver memoria del proyecto).
  const onPasteToken = async () => {
    const t = pastedToken.trim();
    if (!t) return;
    setBusy(true);
    try {
      await signInWithToken(t);
      // El AuthGate redirige a /(tabs) automáticamente al ver user != null.
    } catch (e: any) {
      Alert.alert('Token inválido', e?.body?.detail || `HTTP ${e?.status || ''}`);
    } finally {
      setBusy(false);
    }
  };

  // Pegar desde clipboard (workaround para iOS multiline TextInput).
  const onPasteFromClipboard = async () => {
    try {
      const txt = await Clipboard.getStringAsync();
      if (!txt.trim()) {
        Alert.alert('Clipboard vacío', 'Copiá el JWT primero desde tu Mac y volvé a tocar este botón.');
        return;
      }
      setPastedToken(txt.trim());
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo leer el clipboard');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[`${Colors.orange}1A`, 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.8, y: 0 }}
        end={{ x: 0.2, y: 1 }}
      />
      <View style={styles.card}>
        <View style={styles.logoRow}>
          <View style={styles.logoSquare} />
          <View>
            <Text style={[TextStyles.display, { color: Colors.text }]}>Maestro Claudio</Text>
            <Text style={[TextStyles.monoSm, { color: Colors.muted }]}>v0.1 · Master Cyber</Text>
          </View>
        </View>

        <Text style={styles.copy}>
          Tu agente de estudio personal. Procesa grabaciones, extrae exam tips, te recuerda
          evaluaciones y responde preguntas con base en tu propio material.
        </Text>

        <Pressable
          onPress={onPress}
          disabled={!request || busy || loading}
          style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85 }]}
        >
          {busy
            ? <ActivityIndicator color="#202124" />
            : <>
                <Ionicons name="logo-google" size={18} color="#4285F4" />
                <Text style={styles.googleText}>Continuar con Google</Text>
              </>}
        </Pressable>

        <Text style={styles.note}>
          Al continuar autorizás acceso a Google Drive y Calendar (solo lectura) para detectar
          tus clases y materiales.
        </Text>

        {/* ── Atajo DEV (eliminar cuando OAuth nativo esté configurado) ── */}
        <Pressable onPress={() => setShowDevPaste(s => !s)} style={{ marginTop: Spacing.xl }}>
          <Text style={[TextStyles.small, { color: Colors.muted, textAlign: 'center' }]}>
            {showDevPaste ? '▼ ocultar atajo dev' : '▶ atajo dev (pegar JWT)'}
          </Text>
        </Pressable>

        {showDevPaste && (
          <View style={styles.devBox}>
            <Text style={[TextStyles.small, { color: Colors.muted, marginBottom: Spacing.sm }]}>
              1) Copiá el JWT en tu Mac: DevTools → Application → Cookies → maestro_session.{'\n'}
              2) Tocá "Pegar desde portapapeles" abajo.
            </Text>
            <Pressable onPress={onPasteFromClipboard} style={styles.pasteBtn}>
              <Ionicons name="clipboard-outline" size={14} color={Colors.text} />
              <Text style={{ color: Colors.text, fontFamily: Fonts.bodyMedium, fontSize: 12 }}>
                Pegar desde portapapeles
              </Text>
            </Pressable>
            <TextInput
              value={pastedToken}
              onChangeText={setPastedToken}
              placeholder="(o pegá manualmente acá: eyJ...)"
              placeholderTextColor={Colors.muted2}
              style={styles.devInput}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            {pastedToken.length > 0 && (
              <Text style={[TextStyles.small, { color: Colors.muted, marginBottom: Spacing.sm }]}>
                {pastedToken.length} chars copiados
              </Text>
            )}
            <Pressable onPress={onPasteToken} disabled={busy || !pastedToken.trim()} style={[styles.devBtn, (busy || !pastedToken.trim()) && { opacity: 0.5 }]}>
              <Text style={{ color: '#fff', fontFamily: Fonts.bodyMedium, fontSize: 13 }}>
                {busy ? 'Verificando…' : 'Loguear con este token'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.bg2,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.xxxl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  logoSquare: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.orange,
  },
  copy: {
    color: Colors.muted,
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  googleBtn: {
    backgroundColor: '#fff',
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  googleText: {
    color: '#202124',
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
  },
  note: {
    marginTop: Spacing.xl,
    color: Colors.muted,
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  devBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.bg3,
    borderColor: Colors.border2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  devInput: {
    backgroundColor: Colors.bg2,
    color: Colors.text,
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  devBtn: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.muted,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.bg2,
    borderColor: Colors.border2,
    borderWidth: 1,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
});
