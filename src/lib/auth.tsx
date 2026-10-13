import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PLANS, type PlanLimits } from '@shared/plans';
import type { MeResponse } from '@shared/types';
import { get, UNAUTHORIZED_EVENT } from './api';
import { getToken, setToken } from './storage';

interface AuthState {
  token: string | null;
  me: MeResponse | undefined;
  loading: boolean;
  limits: PlanLimits;
  isPremium: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
  refresh: () => Promise<unknown>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());
  const qc = useQueryClient();

  const signOut = useCallback(() => {
    setToken(null);
    setTok(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, [signOut]);

  const meQ = useQuery({ queryKey: ['me'], queryFn: () => get<MeResponse>('/me'), enabled: !!token, staleTime: 60_000 });

  const value = useMemo<AuthState>(() => {
    const plan = meQ.data?.agent.plan ?? 'free';
    return {
      token,
      me: meQ.data,
      loading: !!token && meQ.isLoading,
      limits: PLANS[plan],
      isPremium: plan === 'premium',
      signIn: (t) => {
        setToken(t);
        qc.clear();
        setTok(t);
      },
      signOut,
      refresh: () => qc.invalidateQueries(),
    };
  }, [token, meQ.data, meQ.isLoading, qc, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
