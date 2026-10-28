import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { FEATURE_LABELS, type PremiumFeature } from '@shared/plans';
import { useT } from '@/lib/i18n';
import { errorText } from '@/lib/errors';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'premium';
  size?: 'sm' | 'md';
  loading?: boolean;
};
const btnBase = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
const btnVariants = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
  secondary: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50',
  ghost: 'text-stone-700 hover:bg-stone-200/60',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  premium: 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 hover:from-amber-300 hover:to-amber-400 shadow-sm',
};
export const btnClass = (variant: keyof typeof btnVariants = 'primary', size: 'sm' | 'md' = 'md', extra = '') =>
  cx(btnBase, btnVariants[variant], size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm', extra);

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button className={cx(btnClass(variant, size), className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', size = 'md', className, children }: { to: string; variant?: keyof typeof btnVariants; size?: 'sm' | 'md'; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={btnClass(variant, size, className)}>
      {children}
    </Link>
  );
}

const fieldCls = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-stone-100';

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TextInput({ label, hint, error, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) => <input id={id} className={fieldCls} {...rest} />}
    </Field>
  );
}
/** Password field with a show / hide toggle (keyboard and screen-reader friendly). */
export function PasswordInput({ label, hint, error, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; hint?: string; error?: string }) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) => (
        <div className="relative">
          <input id={id} type={show ? 'text' : 'password'} className={cx(fieldCls, 'pr-11')} {...rest} />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('Hide password') : t('Show password')}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-stone-500 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      )}
    </Field>
  );
}

export function TextArea({ label, hint, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => <textarea id={id} rows={4} className={fieldCls} {...rest} />}
    </Field>
  );
}
export function Select({ label, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <select id={id} className={fieldCls} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}
export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        <span className="font-medium text-stone-800">{label}</span>
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5', className)}>{children}</div>;
}

const tones = {
  gray: 'bg-stone-100 text-stone-700',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-sky-100 text-sky-800',
  teal: 'bg-brand-100 text-brand-800',
  purple: 'bg-violet-100 text-violet-800',
};
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  const t = useT();
  return <Loader2 className={cx('size-5 animate-spin text-brand-700', className)} aria-label={t('Loading')} />;
}
export function PageLoader() {
  return (
    <div className="flex justify-center py-20">
      <Spinner className="size-7" />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  const msg = errorText(t, error);
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-stone-900/50" onClick={onClose} />
      <div className={cx('relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label={t('Close')}>
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-[calc(1rem+var(--safe-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export function PremiumBadge() {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
      <Crown className="size-3" /> {t('Premium')}</span>
  );
}

/** Full-page / inline prompt shown when a free account hits a Premium feature. */
export function UpgradePrompt({ feature, text, compact }: { feature: PremiumFeature; text?: string; compact?: boolean }) {
  const t = useT();
  return (
    <div className={cx('rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white text-center', compact ? 'p-4' : 'px-6 py-14')}>
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Crown className="size-6" />
      </div>
      <h3 className="text-lg font-extrabold">{t('{feature} is a Premium feature', { feature: t(FEATURE_LABELS[feature]) })}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-stone-600">{text ?? t('Upgrade to Khondo Premium to unlock it, plus more listings.')}</p>
      <Link to="/app/billing" className={btnClass('premium', 'md', 'mt-4')}>
        <Crown className="size-4" /> {t('See Premium')}</Link>
    </div>
  );
}

export function Stat({ label, value, tone = 'text-stone-900', to }: { label: string; value: ReactNode; tone?: string; to?: string }) {
  const inner = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={cx('mt-1 text-2xl font-extrabold', tone)}>{value}</div>
    </>
  );
  const cls = 'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm';
  return to ? (
    <Link to={to} className={cx(cls, 'transition hover:border-brand-300 hover:shadow')}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
