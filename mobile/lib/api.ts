// API client. Lee Bearer token de SecureStore (Keychain/Keystore) y lo manda
// en cada request. Base URL configurable vía app.json → expo.extra.apiUrl.
//
// Migración desde AsyncStorage: usuarios con sesión anterior a este cambio
// tienen el JWT en AsyncStorage; getToken() lo migra a SecureStore en el
// primer acceso y limpia el storage viejo.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'mc.session.jwt';

const API_BASE: string =
  (Constants.expoConfig?.extra as any)?.apiUrl || 'http://localhost:8001';

// SecureStore no existe en web (Expo); fallback a AsyncStorage solo ahí.
const isWeb = Platform.OS === 'web';

async function _secureGet(): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function _secureSet(token: string): Promise<void> {
  if (isWeb) return AsyncStorage.setItem(TOKEN_KEY, token);
  return SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function _secureDelete(): Promise<void> {
  if (isWeb) return AsyncStorage.removeItem(TOKEN_KEY);
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function getToken(): Promise<string | null> {
  const fromSecure = await _secureGet();
  if (fromSecure) return fromSecure;
  // One-shot migración del JWT viejo en AsyncStorage (usuarios pre-fix).
  if (!isWeb) {
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await _secureSet(legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
      return legacy;
    }
  }
  return null;
}

export async function setToken(token: string): Promise<void> {
  await _secureSet(token);
}

export async function clearToken(): Promise<void> {
  await _secureDelete();
  // Limpiar también el legacy por si quedó algo.
  if (!isWeb) await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: any;
  silent401?: boolean;
};

async function request<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const resp = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (resp.status === 401 && !opts.silent401) {
    await clearToken();
  }
  if (!resp.ok) {
    let body: any = null;
    try { body = await resp.json(); } catch { /* not json */ }
    throw new ApiError(resp.status, body);
  }
  if (resp.status === 204) return null as any;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return resp.text() as any;
}

export const api = {
  get:    <T = any>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...(opts || {}), method: 'GET' }),
  post:   <T = any>(path: string, body?: any, opts?: RequestOptions) =>
    request<T>(path, { ...(opts || {}), method: 'POST', body }),
  patch:  <T = any>(path: string, body?: any, opts?: RequestOptions) =>
    request<T>(path, { ...(opts || {}), method: 'PATCH', body }),
  del:    <T = any>(path: string, body?: any, opts?: RequestOptions) =>
    request<T>(path, { ...(opts || {}), method: 'DELETE', body }),
};

export { API_BASE };
