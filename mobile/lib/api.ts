// API client. Lee Bearer token de AsyncStorage y lo manda en cada request.
// Base URL configurable vía app.json → expo.extra.apiUrl (override en EAS).

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const TOKEN_KEY = 'mc.session.jwt';

const API_BASE: string =
  (Constants.expoConfig?.extra as any)?.apiUrl || 'http://localhost:8001';

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
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
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
