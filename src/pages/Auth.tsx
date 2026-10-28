import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, MailCheck, Search } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { PrefsMenu } from '@/components/PrefsMenu';
import { Button, ErrorNote, PasswordInput, TextInput, cx } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useAuth, type Role } from '@/lib/auth';
import { useI18n, useT } from '@/lib/i18n';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="relative grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 to-sand px-4 py-10">
      <div className="absolute right-4 top-4"><PrefsMenu /></div>
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex justify-center">
          <Logo />
        </Link>
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mb-5 mt-1 text-sm text-stone-500">{subtitle}</p>
          {children}
        </div>
        {footer && <p className="mt-5 text-center text-sm text-stone-600">{footer}</p>}
        <p className="mt-3 text-center text-sm">
          <Link to="/browse" className="font-semibold text-stone-500 underline hover:text-stone-800">{t('Just looking? Browse properties as a guest')}</Link>
        </p>
      </div>
    </div>
  );
}

interface Pending {
  email: string;
  emailSent: boolean;
}

function useAuthForm(path: '/auth/login' | '/auth/register') {
  const { signIn } = useAuth();
  const { lang } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // Set when the account exists but its email address still has to be verified.
  const [pending, setPending] = useState<Pending | null>(null);
  const submit = async (e: FormEvent, payload: Record<string, string>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ token?: string; role?: Role; verificationRequired?: boolean; emailSent?: boolean }>(path, { ...payload, lang });
      if (res.verificationRequired) {
        setPending({ email: payload.email, emailSent: res.emailSent !== false });
        return;
      }
      signIn(res.token!);
      const from = (loc.state as { from?: string } | null)?.from;
      // Send people back where they were; otherwise to the right home for their account type.
      nav(from && (res.role === 'customer' ? !from.startsWith('/app') : true) ? from : res.role === 'customer' ? '/account' : '/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') setPending({ email: payload.email, emailSent: true });
      else setError(err);
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, busy, pending, clearPending: () => setPending(null) };
}

const COOLDOWN_S = 60;

/** "Check your email" panel with a resend button (60 s cooldown, matching the server). */
export function VerifyPending({ email, emailSent, onBack, backLabel }: { email: string; emailSent: boolean; onBack: () => void; backLabel: string }) {
  const t = useT();
  const { lang } = useI18n();
  const [left, setLeft] = useState(COOLDOWN_S);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const resend = async () => {
    setState('sending');
    try {
      await post('/auth/resend-verification', { email, lang });
      setState('sent');
      setLeft(COOLDOWN_S);
    } catch {
      setState('error');
    }
  };
  return (
    <div className="space-y-4 text-center" role="status">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-100 text-brand-700"><MailCheck className="size-7" /></div>
      <p className="text-sm text-stone-600">
        {emailSent ? t('We sent a verification link to {email}. Open it to activate your account.', { email }) : t('We couldn’t send the email just now. Press “Resend email” to try again.')}
      </p>
      <p className="break-all rounded-xl bg-stone-50 px-3 py-2 text-sm font-bold">{email}</p>
      <p className="text-xs text-stone-500">{t('Can’t find it? Check your spam folder. The link works for 24 hours.')}</p>
      {state === 'sent' && <p className="text-sm font-semibold text-emerald-700">{t('Email sent again.')}</p>}
      {state === 'error' && <p className="text-sm font-semibold text-red-600">{t('Could not resend. Please try again in a moment.')}</p>}
      <Button variant="secondary" className="w-full" disabled={left > 0} loading={state === 'sending'} onClick={resend}>
        {left > 0 ? t('Resend email in {seconds}s', { seconds: left }) : t('Resend email')}
      </Button>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-brand-700 underline">{backLabel}</button>
    </div>
  );
}

const homeFor = (role: Role | null) => (role === 'customer' ? '/account' : '/app');

export function LoginPage() {
  const t = useT();
  const { token, role } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, busy, pending, clearPending } = useAuthForm('/auth/login');
  if (token) return <Navigate to={homeFor(role)} replace />;
  if (pending) {
    return (
      <AuthLayout title={t('Verify your email')} subtitle={t('One more step before you can sign in.')}>
        <VerifyPending email={pending.email} emailSent={pending.emailSent} onBack={clearPending} backLabel={t('Back to sign in')} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title={t('Welcome back')}
      subtitle={t('Sign in to your account.')}
      footer={
        <>{t('New to Khondo?')}{' '}
          <Link to={`/register${params.get('role') ? `?role=${params.get('role')}` : ''}`} className="font-semibold text-brand-700 underline">{t('Create a free account')}</Link>
        </>
      }
    >
      <form onSubmit={(e) => submit(e, { email, password })} className="space-y-4">
        <TextInput label={t('Email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordInput label={t('Password')} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorNote error={error} />
        <Button type="submit" loading={busy} className="w-full">{t('Sign in')}</Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const t = useT();
  const { token, role: current } = useAuth();
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role>(params.get('role') === 'customer' ? 'customer' : 'agent');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, busy, pending, clearPending } = useAuthForm('/auth/register');
  if (token) return <Navigate to={homeFor(current)} replace />;
  if (pending) {
    return (
      <AuthLayout title={t('Check your email')} subtitle={t('Your account is almost ready.')}>
        <VerifyPending email={pending.email} emailSent={pending.emailSent} onBack={clearPending} backLabel={t('Use a different email')} />
      </AuthLayout>
    );
  }
  const choices: { id: Role; icon: typeof Search; title: string; text: string }[] = [
    { id: 'customer', icon: Search, title: t('I’m looking for a property'), text: t('Save favourites and track your inquiries') },
    { id: 'agent', icon: Briefcase, title: t('I’m a real estate agent'), text: t('Build your portfolio and landing page') },
  ];
  return (
    <AuthLayout
      title={t('Create your free account')}
      subtitle={role === 'agent' ? t('Build your portfolio and landing page in minutes.') : t('Save properties and keep track of the agents you contact.')}
      footer={
        <>{t('Already have an account?')}{' '}
          <Link to="/login" className="font-semibold text-brand-700 underline">{t('Sign in')}</Link>
        </>
      }
    >
      <form onSubmit={(e) => submit(e, { name, email, password, role, ...(role === 'customer' && phone ? { phone } : {}) })} className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Account type')}>
          {choices.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={role === c.id} onClick={() => setRole(c.id)} className={cx('rounded-xl border-2 p-3 text-left transition', role === c.id ? 'border-brand-700 bg-brand-50' : 'border-stone-200 hover:border-stone-300')}>
              <c.icon className={cx('mb-1 size-5', role === c.id ? 'text-brand-700' : 'text-stone-400')} />
              <div className="text-sm font-bold leading-tight">{c.title}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-stone-500">{c.text}</div>
            </button>
          ))}
        </div>
        <TextInput label={role === 'agent' ? t('Your name or agency') : t('Your name')} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput label={t('Email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {role === 'customer' && <TextInput label={t('Phone (optional)')} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        <PasswordInput label={t('Password')} autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} hint={t('At least 8 characters')} />
        <ErrorNote error={error} />
        <Button type="submit" loading={busy} className="w-full">{t('Create account')}</Button>
      </form>
    </AuthLayout>
  );
}
