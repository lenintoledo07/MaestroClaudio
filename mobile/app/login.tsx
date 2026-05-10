import * as React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../lib/auth';
import { Colors, Spacing, Radius } from '../constants/Colors';
import { Fonts, TextStyles } from '../constants/Typography';

export default function LoginScreen() {
  const { signIn, request, loading } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const onPress = async () => {
    if (!request) return;
    setBusy(true);
    try { await signIn(); } finally { setBusy(false); }
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
});
