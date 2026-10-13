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

// Superuser-only testing aid: send "X-View-As-Plan: free" so the API behaves as the Free plan.
const VIEW_KEY = 'khondo.viewAsFree';
export function getViewAsFree(): boolean {
  try {
    return localStorage.getItem(VIEW_KEY) === '1';
  } catch {
    return false;
  }
}
export function setViewAsFree(on: boolean) {
  try {
    if (on) localStorage.setItem(VIEW_KEY, '1');
    else localStorage.removeItem(VIEW_KEY);
  } catch {
    /* ignore */
  }
}

// Guest favourites live in the browser until the visitor signs in.
const FAV_KEY = 'khondo.favs';
export function getGuestFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function setGuestFavs(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(FAV_KEY, JSON.stringify(ids.slice(0, 200)));
    else localStorage.removeItem(FAV_KEY);
  } catch {
    /* ignore */
  }
}
