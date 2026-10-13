import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { api, get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel } from '@/lib/format';
import { PlanCards } from '@/components/PlanCards';
import { Button, Card, ErrorNote, PageHeader } from '@/components/ui';
import type { Agent } from '@shared/types';

export function BillingPage() {
  const { me, isPremium, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const cfg = useQuery({ queryKey: ['billing-config'], queryFn: () => get<{ stripe: boolean; devUpgrade: boolean }>('/billing/config') });
  const status = params.get('status');

  // Stripe sends the customer back here; the webhook may land a moment later, so poll briefly.
  useEffect(() => {
    if (status !== 'success') return;
    refresh();
    const t = setInterval(refresh, 2500);
    const stop = setTimeout(() => clearInterval(t), 15000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [status, refresh]);

  const go = (url: string | null | undefined) => {
    if (url) window.location.href = url;
    else refresh();
  };
  const upgrade = useMutation({ mutationFn: () => post<{ url: string | null }>('/billing/checkout'), onSuccess: (r) => go(r.url) });
  const portal = useMutation({ mutationFn: () => post<{ url: string }>('/billing/portal'), onSuccess: (r) => go(r.url) });
  const devPlan = useMutation({ mutationFn: (plan: 'free' | 'premium') => api<{ agent: Agent }>('/billing/dev-plan', { json: { plan } }), onSuccess: () => refresh() });
  const canPay = cfg.data?.stripe || cfg.data?.devUpgrade;

  return (
    <>
      <PageHeader title="Plan & billing" subtitle={isPremium ? `Premium${me!.agent.planRenewsAt ? ` · renews ${dateLabel(me!.agent.planRenewsAt)}` : ''}` : 'You’re on the Free plan.'} />
      {status === 'success' && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Thank you! Your Premium plan is being activated…</div>}
      {status === 'cancelled' && <div className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm" onClick={() => setParams({})}>Checkout cancelled — no charge was made.</div>}
      <PlanCards
        current={me!.agent.plan}
        action={
          canPay ? (
            <Button variant="premium" className="w-full" loading={upgrade.isPending} onClick={() => upgrade.mutate()}>
              <Crown className="size-4" /> Upgrade to Premium
            </Button>
          ) : (
            <div className="rounded-xl bg-amber-100 px-3 py-2 text-center text-sm text-amber-900">Online payments are not enabled yet.</div>
          )
        }
      />
      <div className="mt-4 space-y-3">
        <ErrorNote error={upgrade.error ?? portal.error} />
        {isPremium && cfg.data?.stripe && (
          <Button variant="secondary" loading={portal.isPending} onClick={() => portal.mutate()}>
            Manage subscription & invoices
          </Button>
        )}
        {cfg.data?.devUpgrade && (
          <Card className="border-dashed text-sm">
            <b>Developer mode</b> — Stripe isn’t configured, so plans can be switched freely (<code>ALLOW_DEV_UPGRADE=true</code>). Never enable this in production.
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => devPlan.mutate('free')}>Switch to Free</Button>
              <Button size="sm" variant="secondary" onClick={() => devPlan.mutate('premium')}>Switch to Premium</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
