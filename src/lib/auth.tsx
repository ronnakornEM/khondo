import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PLANS, type PlanLimits } from '@shared/plans';
import type { CustomerMeResponse, MeResponse } from '@shared/types';
import { get, UNAUTHORIZED_EVENT } from './api';
import { getToken, getViewAsFree, setToken, setViewAsFree } from './storage';

export type Role = 'agent' | 'customer';

interface AuthState {
  token: string | null;
  /** Agent workspace (undefined for guests and customers). */
  me: MeResponse | undefined;
  /** Customer account (undefined for guests and agents). */
  customer: CustomerMeResponse | undefined;
  role: Role | null;
  loading: boolean;
  limits: PlanLimits;
  isPremium: boolean;
  isSuperuser: boolean;
  viewAsFree: boolean;
  setViewAsFree: (on: boolean) => void;
  signIn: (token: string) => void;
  signOut: () => void;
  refresh: () => Promise<unknown>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());
  const [viewAsFree, setView] = useState<boolean>(() => getViewAsFree());
  const qc = useQueryClient();

  const signOut = useCallback(() => {
    setToken(null);
    setViewAsFree(false);
    setView(false);
    setTok(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, [signOut]);

  const meQ = useQuery({ queryKey: ['me'], queryFn: () => get<MeResponse | CustomerMeResponse>('/me'), enabled: !!token, staleTime: 60_000 });

  const value = useMemo<AuthState>(() => {
    const data = meQ.data;
    const me = data?.role === 'agent' ? data : undefined;
    const customer = data?.role === 'customer' ? data : undefined;
    const plan = me?.agent.plan ?? 'free';
    return {
      token,
      me,
      customer,
      role: data?.role ?? null,
      loading: !!token && meQ.isLoading,
      limits: PLANS[plan],
      isPremium: plan === 'premium',
      isSuperuser: !!data?.isSuperuser,
      viewAsFree,
      setViewAsFree: (on) => {
        setViewAsFree(on);
        setView(on);
        qc.invalidateQueries();
      },
      signIn: (t) => {
        setToken(t);
        qc.clear();
        setTok(t);
      },
      signOut,
      refresh: () => qc.invalidateQueries(),
    };
  }, [token, meQ.data, meQ.isLoading, viewAsFree, qc, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
