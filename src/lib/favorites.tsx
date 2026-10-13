import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, api } from './api';
import { useAuth } from './auth';
import { getGuestFavs, setGuestFavs } from './storage';

// Saved properties. Guests: kept in this browser. Signed in: kept on the server, and anything a guest saved
// before signing in is merged into the account.

interface Ctx {
  ids: Set<string>;
  isFav: (id: string) => boolean;
  toggle: (id: string) => void;
}
const FavCtx = createContext<Ctx | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [guest, setGuest] = useState<string[]>(() => getGuestFavs());
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const merged = useRef<string | null>(null);

  const serverQ = useQuery({
    queryKey: ['favorite-ids'],
    queryFn: () => get<{ ids: string[] }>('/favorites/ids'),
    enabled: !!token,
    staleTime: 60_000,
  });

  // On sign-in, move guest favourites into the account (once per token).
  useEffect(() => {
    if (!token || merged.current === token) return;
    merged.current = token;
    const local = getGuestFavs();
    if (!local.length) return;
    api('/favorites/merge', { method: 'POST', json: { ids: local } })
      .then(() => {
        setGuestFavs([]);
        setGuest([]);
        qc.invalidateQueries({ queryKey: ['favorite-ids'] });
        qc.invalidateQueries({ queryKey: ['favorites'] });
      })
      .catch(() => undefined);
  }, [token, qc]);

  useEffect(() => {
    if (!token) merged.current = null;
  }, [token]);

  const ids = useMemo(() => {
    const base = new Set(token ? (serverQ.data?.ids ?? []) : guest);
    for (const [id, on] of Object.entries(optimistic)) (on ? base.add(id) : base.delete(id));
    return base;
  }, [token, serverQ.data, guest, optimistic]);

  const toggle = useCallback(
    (id: string) => {
      const on = !ids.has(id);
      if (!token) {
        const next = on ? [id, ...guest.filter((x) => x !== id)] : guest.filter((x) => x !== id);
        setGuestFavs(next);
        setGuest(next);
        return;
      }
      setOptimistic((o) => ({ ...o, [id]: on }));
      (on ? api(`/favorites/${id}`, { method: 'PUT', json: {} }) : del(`/favorites/${id}`))
        .catch(() => undefined)
        .finally(async () => {
          await qc.invalidateQueries({ queryKey: ['favorite-ids'] });
          qc.invalidateQueries({ queryKey: ['favorites'] });
          setOptimistic((o) => {
            const { [id]: _drop, ...rest } = o;
            return rest;
          });
        });
    },
    [ids, token, guest, qc],
  );

  const value = useMemo<Ctx>(() => ({ ids, isFav: (id) => ids.has(id), toggle }), [ids, toggle]);
  return <FavCtx.Provider value={value}>{children}</FavCtx.Provider>;
}

export function useFavorites() {
  const v = useContext(FavCtx);
  if (!v) throw new Error('useFavorites outside FavoritesProvider');
  return v;
}

