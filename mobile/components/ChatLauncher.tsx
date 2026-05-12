import * as React from 'react';
import { Pressable, StyleSheet, View, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';

import { useAuth } from '../lib/auth';
import { Colors } from '../constants/Colors';

/**
 * FAB global mobile que abre el chat con Maestro desde cualquier pantalla.
 * En mobile el "fullscreen" es el default — pulsar el FAB navega a la tab
 * /chat. Se oculta en login, onboarding y en la propia tab de chat.
 */
export default function ChatLauncher() {
  const router = useRouter();
  const segments = useSegments();
  const { user } = useAuth();

  // Animación de pulse del badge indigo (igual concepto que web).
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (!user || !user.drive_folder_id) return null;
  // segments[0] === 'login' | 'onboarding' | '(tabs)' | 'course' | 'signals' | undefined
  // segments[1] === 'chat' cuando estamos en /(tabs)/chat
  const first = segments[0];
  const second = segments[1];
  if (first === 'login' || first === 'onboarding') return null;
  if (first === '(tabs)' && second === 'chat') return null;

  const scale = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 2.5, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0, 0] });

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/chat' as any)}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ translateY: 1 }] }]}
      accessibilityLabel="Abrir chat con Maestro"
    >
      <Ionicons name="chatbubbles" size={22} color={Colors.text} />
      <View style={styles.badge}>
        <Animated.View style={[styles.badgePulse, { transform: [{ scale }], opacity }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 90, // arriba de la tab bar de expo-router (≈80px en iOS)
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.bg2,
    borderWidth: 1,
    borderColor: Colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 50,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.orange,
  },
  badgePulse: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.orange,
  },
});
