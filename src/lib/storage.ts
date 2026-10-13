// Single seam for persistence. On mobile, swap the body for @capacitor/preferences (or secure storage).
const KEY = 'khondo.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
