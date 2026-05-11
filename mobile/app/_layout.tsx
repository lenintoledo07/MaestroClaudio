// Root layout: carga fuentes, monta AuthProvider, y delega navegación a expo-router.

import * as React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '../lib/auth';
import { useAppFonts } from '../constants/Typography';
import { Colors } from '../constants/Colors';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  cleanupNotificationListeners,
} from '../services/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user && !inLogin) {
      router.replace('/login');
      return;
    }
    if (user && inLogin) {
      router.replace('/(tabs)' as any);
      return;
    }
    // Usuario logueado pero sin carpeta de Drive configurada → onboarding.
    if (user && !user.drive_folder_id && !inOnboarding) {
      router.replace('/onboarding' as any);
      return;
    }
    // Ya configurado pero atrapado en onboarding (ej. F5 manual) → al dashboard.
    if (user && user.drive_folder_id && inOnboarding) {
      router.replace('/(tabs)' as any);
    }
  }, [user, loading, segments]);

  // Registrar push notifications cuando hay sesión
  React.useEffect(() => {
    if (!user) return;
    registerForPushNotifications().catch(() => {});
    setupNotificationListeners();
    return () => cleanupNotificationListeners();
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg }}>
        <ActivityIndicator color={Colors.orange} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const fontsLoaded = useAppFonts();

  React.useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <AuthGate>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.bg },
            headerTintColor: Colors.text,
            contentStyle: { backgroundColor: Colors.bg },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="course/[id]" options={{ title: 'Materia' }} />
          <Stack.Screen name="signals/[kind]" options={{ title: 'Signals' }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
