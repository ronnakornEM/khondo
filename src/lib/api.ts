import { getToken, getViewAsFree, setToken } from './storage';

// Same-origin on the web. For the Capacitor build set VITE_API_URL=https://your-app.vercel.app
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '') + '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
  get isPremiumGate() {
    return this.status === 402;
  }
}

export const UNAUTHORIZED_EVENT = 'khondo:unauthorized';

interface Options {
  method?: string;
  json?: unknown;
  form?: FormData;
  auth?: boolean;
}

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token && opts.auth !== false) {
    headers.Authorization = `Bearer ${token}`;
    if (getViewAsFree()) headers['X-View-As-Plan'] = 'free';
  }
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (opts.json !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && opts.auth !== false) {
      setToken(null);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
  }
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const patch = <T,>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
