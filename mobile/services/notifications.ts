// Notificaciones push (Fase 6.3). Registra el Expo Push Token con el backend
// y configura listeners para foreground / tap.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { api } from '../lib/api';

Notifications.setNotificationHandler({
  // SDK 54: shouldShowAlert está deprecado a favor de shouldShowBanner+shouldShowList.
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Allowlist de rutas válidas para data.route. Defensa contra payloads remotos
// con rutas arbitrarias (ej. rutas internas no expuestas o intentos de hijacking
// del flow de navegación). Si en el futuro se agregan tabs nuevos, ampliar.
const _ROUTE_ALLOWLIST = /^\/(?:\(tabs\)(?:\/(?:index|courses|chat|calendar))?|course\/[A-Za-z0-9_-]+|login)$/;

function _isAllowedRoute(route: string): boolean {
  return _ROUTE_ALLOWLIST.test(route);
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('push: solo funciona en device físico');
    return null;
  }

  // Permisos
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    console.warn('push: permiso no concedido');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#818CF8',
    });
  }

  let token: string;
  try {
    const data = await Notifications.getExpoPushTokenAsync();
    token = data.data;
  } catch (e) {
    console.warn('push: getExpoPushTokenAsync falló', e);
    return null;
  }

  // Sincronizar con el backend
  try {
    await api.post('/users/push-token', { token });
  } catch (e) {
    console.warn('push: backend register falló', e);
  }

  return token;
}

let _foregroundSub: Notifications.Subscription | null = null;
let _tapSub: Notifications.Subscription | null = null;

export function setupNotificationListeners() {
  cleanupNotificationListeners();

  // App abierta + notif recibida → el handler de arriba ya muestra alert
  _foregroundSub = Notifications.addNotificationReceivedListener((n) => {
    console.log('push received in foreground:', n.request.content.title);
  });

  // Usuario toca la notif (app cerrada o background) → routear según data.type
  _tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data: any = response.notification.request.content.data || {};
    // data.route solo se acepta si matchea el allowlist. Cualquier otra cosa
    // (rutas arbitrarias, javascript:, etc.) se descarta silenciosamente.
    if (data.route && typeof data.route === 'string') {
      if (_isAllowedRoute(data.route)) {
        try { router.push(data.route as any); } catch { /* ignore */ }
      } else {
        console.warn('push: data.route no permitido, descartado:', data.route);
      }
      return;
    }
    if (data.type === 'material_ready' && data.course_id) {
      router.push(`/course/${data.course_id}`);
    } else if (data.type?.startsWith('eval_reminder') && data.course_id) {
      router.push(`/course/${data.course_id}`);
    } else if (data.type === 'weekly_checklist') {
      router.push('/(tabs)' as any);
    }
  });
}

export function cleanupNotificationListeners() {
  _foregroundSub?.remove();
  _tapSub?.remove();
  _foregroundSub = null;
  _tapSub = null;
}

export async function clearPushTokenOnLogout() {
  try { await api.del('/users/push-token'); } catch { /* ignore */ }
}
