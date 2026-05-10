/**
 * API client. Todas las llamadas pasan por el prefijo /api/* que vite
 * proxy redirige a http://localhost:8001 en dev (rewrite quita /api).
 *
 * Credentials: 'include' es necesario para que la cookie de sesión
 * se mande en cada request.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

class ApiError extends Error {
  constructor(status, body) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, silent401 = false, headers = {} } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(`${BASE}${path}`, opts);

  if (resp.status === 401 && !silent401) {
    // Sesión expirada o no autenticada. Redirigir a login (excepto si ya estamos ahí).
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    throw new ApiError(401, null);
  }

  if (!resp.ok) {
    let detail = null;
    try { detail = await resp.json(); } catch { /* not json */ }
    throw new ApiError(resp.status, detail);
  }

  if (resp.status === 204) return null;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return resp.text();
}

export const api = {
  get:    (path, opts)        => request(path, { ...(opts || {}), method: 'GET' }),
  post:   (path, body, opts)  => request(path, { ...(opts || {}), method: 'POST', body }),
  patch:  (path, body, opts)  => request(path, { ...(opts || {}), method: 'PATCH', body }),
  del:    (path, body, opts)  => request(path, { ...(opts || {}), method: 'DELETE', body }),
};

export { ApiError, BASE };
