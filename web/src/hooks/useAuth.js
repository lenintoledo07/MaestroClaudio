import { useCallback, useEffect, useState } from 'react';
import { api, BASE } from '../api/client';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await api.get('/auth/me', { silent401: true });
      setUser(me);
    } catch (e) {
      // 401 = no logueado; otros errores los exponemos
      if (e.status !== 401) setError(e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(() => {
    // Full-page redirect al backend (cross-origin en prod, mismo origin con
    // proxy vite en dev). BASE viene de api/client.js → resuelve a
    // `/api` en dev y `https://study.denario.cloud/api` en prod.
    window.location.assign(`${BASE}/auth/google`);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', null, { silent401: true }); } catch { /* ignore */ }
    setUser(null);
    window.location.assign('/login');
  }, []);

  return { user, loading, error, login, logout, refresh };
}
