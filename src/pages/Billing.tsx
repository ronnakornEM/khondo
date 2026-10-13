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
import { useT } from '@/lib/i18n';

export function BillingPage() {
  const t = useT();
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
      <PageHeader title={t('Plan & billing')} subtitle={isPremium ? `${t('Premium')}${me!.agent.planRenewsAt ? ` · ${t('renews {date}', { date: dateLabel(me!.agent.planRenewsAt) })}` : ''}` : t('You’re on the Free plan.')} />
      {status === 'success' && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{t('Thank you! Your Premium plan is being activated…')}</div>}
      {status === 'cancelled' && <div className="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm" onClick={() => setParams({})}>{t('Checkout cancelled — no charge was made.')}</div>}
      <PlanCards
        current={me!.agent.plan}
        action={
          canPay ? (
            <Button variant="premium" className="w-full" loading={upgrade.isPending} onClick={() => upgrade.mutate()}>
              <Crown className="size-4" /> {t('Upgrade to Premium')}</Button>
          ) : (
            <div className="rounded-xl bg-amber-100 px-3 py-2 text-center text-sm text-amber-900">{t('Online payments are not enabled yet.')}</div>
          )
        }
      />
      <div className="mt-4 space-y-3">
        <ErrorNote error={upgrade.error ?? portal.error} />
        {isPremium && cfg.data?.stripe && (
          <Button variant="secondary" loading={portal.isPending} onClick={() => portal.mutate()}>{t('Manage subscription & invoices')}</Button>
        )}
        {cfg.data?.devUpgrade && (
          <Card className="border-dashed text-sm">
            <b>{t('Developer mode')}</b> {t('— Stripe isn’t configured, so plans can be switched freely (ALLOW_DEV_UPGRADE=true). Never enable this in production.')}<div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => devPlan.mutate('free')}>{t('Switch to Free')}</Button>
              <Button size="sm" variant="secondary" onClick={() => devPlan.mutate('premium')}>{t('Switch to Premium')}</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
