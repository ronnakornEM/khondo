import { useMemo, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { DISPLAY_CURRENCIES } from '@shared/currency';
import { LANGS, useI18n } from '@/lib/i18n';
import { useCurrency } from '@/lib/currency';
import { cx } from './ui';

/** Language + display-currency picker. `tone` adapts the trigger to light/dark/photo backgrounds. */
export function PrefsMenu({ tone = 'light', className, align = 'right', up }: { tone?: 'light' | 'dark' | 'glass'; className?: string; align?: 'left' | 'right'; up?: boolean }) {
  const { lang, setLang, t, intl } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const names = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames(intl, { type: 'currency' });
    } catch {
      /* unsupported */
    }
    return (code: string) => dn?.of(code) ?? code;
  }, [intl]);

  const trigger = {
    light: 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
    dark: 'border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700',
    glass: 'border-white/30 bg-black/25 text-white backdrop-blur hover:bg-black/40',
  }[tone];

  return (
    <div className={cx('relative', className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={t('Language and currency')} className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold', trigger)}>
        <Globe className="size-4" />
        {lang.toUpperCase()} · {currency === 'THB' ? '฿' : currency}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={t('Language and currency')} className={cx('absolute z-50 w-72 rounded-2xl border border-stone-200 bg-white p-3 text-stone-900 shadow-xl', up ? 'bottom-full mb-2' : 'top-full mt-2', align === 'right' ? 'right-0' : 'left-0')}>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">{t('Language')}</div>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {LANGS.map((l) => (
                <button key={l.code} type="button" onClick={() => setLang(l.code)} className={cx('rounded-xl border px-2 py-2 text-sm font-semibold', lang === l.code ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-stone-200 hover:bg-stone-50')}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">{t('Also show prices in')}</div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {(['THB', ...DISPLAY_CURRENCIES] as const).map((c) => (
                <button key={c} type="button" onClick={() => { setCurrency(c); setOpen(false); }} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-stone-50', currency === c && 'bg-brand-50 font-semibold text-brand-800')}>
                  <span className="w-10 font-bold">{c === 'THB' ? '฿' : c}</span>
                  <span className="flex-1 truncate">{c === 'THB' ? t('Thai baht only') : names(c)}</span>
                  {currency === c && <Check className="size-4" />}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-stone-500">{t('Prices are always listed in Thai baht (฿). Other currencies are shown beside them as estimates.')}</p>
          </div>
        </>
      )}
    </div>
  );
}
