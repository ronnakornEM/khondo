import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
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
  const { me, isPremium, isSuperuser, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const cfg = useQuery({ queryKey: ['billing-config'], queryFn: () => get<{ stripe: boolean; mode: 'test' | 'live' | null; devUpgrade: boolean }>('/billing/config') });
  const status = params.get('status');

  // Back from Stripe Checkout: ask Stripe directly for the subscription (works even if the webhook hasn't
  // arrived or isn't configured, e.g. when testing locally against the Stripe sandbox). Retry briefly.
  const sync = useMutation({ mutationFn: () => post<{ plan: 'free' | 'premium'; changed: boolean }>('/billing/sync'), onSuccess: () => refresh() });
  useEffect(() => {
    if (status !== 'success' || !cfg.data?.stripe) return;
    let tries = 0;
    let alive = true;
    const run = async () => {
      while (alive && tries++ < 6) {
        try {
          const r = await post<{ plan: string }>('/billing/sync');
          await refresh();
          if (r.plan === 'premium') return;
        } catch {
          /* try again */
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
    };
    run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cfg.data?.stripe]);

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
      {isSuperuser && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <b>{t('Superuser')}</b> — {t('every Premium feature is unlocked on your account. Use Superuser tools to test the Free experience.')}{' '}
          <Link to="/app/admin" className="font-semibold underline">{t('Superuser tools')}</Link>
        </div>
      )}
      {cfg.data?.stripe && cfg.data.mode === 'test' && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="font-bold">{t('Stripe sandbox — no real money is charged')}</div>
          <p className="mt-1">{t('At checkout use test card 4242 4242 4242 4242, any future expiry date, any 3-digit CVC and any postcode. To test a declined card use 4000 0000 0000 0002.')}</p>
        </div>
      )}
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
        {cfg.data?.stripe && (
          <Button variant="ghost" size="sm" loading={sync.isPending} onClick={() => sync.mutate()}>{t('Refresh plan from Stripe')}</Button>
        )}
        {cfg.data?.devUpgrade && !cfg.data.stripe && (
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
