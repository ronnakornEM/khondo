import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, FlaskConical, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import type { AdminOverview } from '@shared/types';
import { api, get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, ErrorNote, PageHeader, PageLoader, Stat, cx } from '@/components/ui';

/** Superuser tools for testing Premium. Only reachable (and only served by the API) for superusers. */
export function AdminPage() {
  const t = useT();
  const qc = useQueryClient();
  const { isSuperuser, viewAsFree, setViewAsFree, me } = useAuth();
  const q = useQuery({ queryKey: ['admin'], queryFn: () => get<AdminOverview>('/admin/overview'), enabled: isSuperuser });
  const cfg = useQuery({ queryKey: ['billing-config'], queryFn: () => get<{ stripe: boolean; mode: 'test' | 'live' | null; devUpgrade: boolean }>('/billing/config'), enabled: isSuperuser });
  const setPlan = useMutation({
    mutationFn: (v: { id: string; plan: 'free' | 'premium' }) => api(`/admin/agents/${v.id}/plan`, { json: { plan: v.plan } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  if (!isSuperuser) return <Navigate to="/app" replace />;
  if (q.isLoading) return <PageLoader />;
  const d = q.data;

  return (
    <>
      <PageHeader title={t('Superuser tools')} subtitle={t('All Premium features are unlocked for your account so you can test them.')} />
      <Card className="mb-5 flex flex-col gap-3 border-violet-200 bg-violet-50/60 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-5 shrink-0 text-violet-700" />
          <div>
            <div className="font-bold">{t('Test as')}</div>
            <p className="text-sm text-stone-600">{t('Switch your own account between the Premium and Free experience to check upgrade prompts and limits.')}</p>
          </div>
        </div>
        <div className="flex shrink-0 rounded-xl bg-white p-1 shadow-sm">
          {[false, true].map((free) => (
            <button key={String(free)} onClick={() => setViewAsFree(free)} className={cx('flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold', viewAsFree === free ? (free ? 'bg-stone-800 text-white' : 'bg-amber-400 text-amber-950') : 'text-stone-500')}>
              {!free && <Crown className="size-4" />}{free ? t('Free') : t('Premium')}
            </button>
          ))}
        </div>
      </Card>
      {me && viewAsFree && <p className="mb-4 rounded-xl bg-stone-800 px-4 py-2 text-sm text-white">{t('You are currently seeing the app as a Free-plan agent.')}</p>}

      {cfg.data && (
        <Card className="mb-5 text-sm">
          <b>{t('Payments')}:</b>{' '}
          {cfg.data.stripe ? <Badge tone={cfg.data.mode === 'test' ? 'amber' : 'red'}>{cfg.data.mode === 'test' ? t('Stripe sandbox (test mode)') : t('Stripe LIVE')}</Badge> : <Badge>{t('Stripe not configured')}</Badge>}
          {cfg.data.devUpgrade && <> <Badge tone="purple">{t('Dev upgrade enabled')}</Badge></>}
        </Card>
      )}

      <ErrorNote error={q.error ?? setPlan.error} />
      {d && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label={t('Agents')} value={d.totals.agents} />
            <Stat label={t('Premium')} value={d.totals.premium} tone="text-amber-600" />
            <Stat label={t('Customers')} value={d.totals.customers} />
            <Stat label={t('Properties')} value={d.totals.properties} />
            <Stat label={t('Inquiries')} value={d.totals.inquiries} />
          </div>
          <Card className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="p-3">{t('Agent')}</th><th className="p-3">{t('Plan')}</th><th className="p-3">{t('Properties')}</th><th className="p-3">{t('Joined')}</th><th className="p-3 text-right">{t('Set plan')}</th></tr>
              </thead>
              <tbody>
                {d.agents.map((a) => (
                  <tr key={a.id} className="border-t border-stone-100">
                    <td className="p-3"><div className="flex items-center gap-1.5 font-semibold">{a.displayName}{a.isSuperuser && <ShieldCheck className="size-4 text-violet-600" aria-label={t('Superuser')} />}</div><div className="text-xs text-stone-500">{a.email} · <a className="underline" href={`/a/${a.slug}`} target="_blank" rel="noreferrer">/a/{a.slug}</a></div></td>
                    <td className="p-3"><Badge tone={a.plan === 'premium' ? 'amber' : 'gray'}>{a.plan === 'premium' ? t('Premium') : t('Free')}</Badge>{a.hasStripe && <span className="ml-1 text-[11px] text-stone-400">Stripe</span>}</td>
                    <td className="p-3">{a.properties}</td>
                    <td className="p-3">{dateLabel(a.createdAt)}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="secondary" loading={setPlan.isPending && setPlan.variables?.id === a.id} onClick={() => setPlan.mutate({ id: a.id, plan: a.plan === 'premium' ? 'free' : 'premium' })}>{a.plan === 'premium' ? t('Make Free') : t('Make Premium')}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
