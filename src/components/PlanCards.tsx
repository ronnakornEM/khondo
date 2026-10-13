import { Check, Crown } from 'lucide-react';
import { PLANS, PREMIUM_PRICE_THB_PER_MONTH, type PlanId } from '@shared/plans';
import { cx } from './ui';
import { useT } from '@/lib/i18n';

export function PlanCards({ current, action }: { current?: PlanId; action?: React.ReactNode }) {
  const t = useT();
  const FREE_FEATURES = [
    t('Up to {n} properties', { n: PLANS.free.maxProperties }),
    t('{n} photos per property', { n: PLANS.free.maxPhotosPerProperty }),
    t('Your own landing page (/a/your-name)'),
    t('Visitor inquiries inbox'),
    t('Basic calendar'),
    t('Khondo branding on your page'),
  ];
  const PREMIUM_FEATURES = [
    t('Up to {n} properties', { n: PLANS.premium.maxProperties }),
    t('{n} photos per property', { n: PLANS.premium.maxPhotosPerProperty }),
    t('Contact management (mini CRM + pipeline)'),
    t('Bills & invoices with print / PDF'),
    t('Advanced calendar: week & day views, recurring events, reminders, .ics sync'),
    t('Premium page themes, announcement banner, no branding'),
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={cx('rounded-3xl border bg-white p-6', current === 'free' ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-stone-200')}>
        <div className="text-sm font-bold uppercase tracking-wide text-stone-500">{t('Free')}</div>
        <div className="mt-1 text-4xl font-extrabold">฿0</div>
        <div className="text-sm text-stone-500">{t('forever')}</div>
        <ul className="mt-5 space-y-2.5 text-sm">
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-700" />{f}</li>
          ))}
        </ul>
        {current === 'free' && <div className="mt-5 rounded-xl bg-brand-50 py-2 text-center text-sm font-bold text-brand-800">{t('Your current plan')}</div>}
      </div>
      <div className={cx('relative rounded-3xl border bg-gradient-to-br from-amber-50 to-white p-6', current === 'premium' ? 'border-amber-500 ring-2 ring-amber-400/30' : 'border-amber-300')}>
        <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-amber-700"><Crown className="size-4" /> {t('Premium')}</div>
        <div className="mt-1 text-4xl font-extrabold">฿{PREMIUM_PRICE_THB_PER_MONTH}<span className="text-base font-semibold text-stone-500"> {t('/ month')}</span></div>
        <div className="text-sm text-stone-500">{t('cancel any time')}</div>
        <ul className="mt-5 space-y-2.5 text-sm">
          {PREMIUM_FEATURES.map((f) => (
            <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-amber-600" />{f}</li>
          ))}
        </ul>
        {current === 'premium' ? <div className="mt-5 rounded-xl bg-amber-100 py-2 text-center text-sm font-bold text-amber-900">{t('Your current plan')}</div> : action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
