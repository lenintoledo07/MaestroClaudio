// Auth context. Manejo de sesión + login con expo-auth-session (Google).

import * as React from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { api, clearToken, getToken, setToken } from './api';

WebBrowser.maybeCompleteAuthSession();

type User = {
  id: string;
  email: string;
  name?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  request: any;
};

const AuthContext = React.createContext<AuthState | null>(null);

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const extra = (Constants.expoConfig?.extra as any) || {};
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: extra.googleIosClientId || undefined,
    androidClientId: extra.googleAndroidClientId || undefined,
    webClientId: extra.googleWebClientId || undefined,
    scopes: SCOPES,
  } as any);

  // Verifica sesión al startup
  React.useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        if (!t) { setUser(null); return; }
        const me: User = await api.get('/auth/me', { silent401: true });
        setUser(me);
      } catch {
        await clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Cuando expo-auth-session devuelve un response success, intercambiamos
  // el id_token con nuestro backend y guardamos el JWT propio.
  React.useEffect(() => {
    (async () => {
      if (response?.type !== 'success') return;
      try {
        const idToken =
          (response as any).params?.id_token ||
          (response as any).authentication?.idToken;
        const accessToken = (response as any).authentication?.accessToken;
        const refreshToken = (response as any).authentication?.refreshToken;
        if (!idToken) {
          throw new Error('No vino id_token de Google');
        }
        const r = await api.post<{ access_token: string; user: User }>(
          '/auth/mobile/exchange',
          {
            id_token: idToken,
            access_token: accessToken,
            refresh_token: refreshToken,
          },
          { silent401: true },
        );
        await setToken(r.access_token);
        setUser(r.user);
      } catch (e) {
        console.warn('auth exchange falló', e);
        await clearToken();
        setUser(null);
      }
    })();
  }, [response]);

  const signIn = React.useCallback(async () => {
    await promptAsync();
  }, [promptAsync]);

  const signOut = React.useCallback(async () => {
    try { await api.post('/auth/logout', null, { silent401: true }); } catch { /* ignore */ }
    await clearToken();
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, loading, signIn, signOut, request }),
    [user, loading, signIn, signOut, request],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de <AuthProvider>');
  return ctx;
}
