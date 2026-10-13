import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Search } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { PrefsMenu } from '@/components/PrefsMenu';
import { Button, ErrorNote, TextInput, cx } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth, type Role } from '@/lib/auth';
import { useT } from '@/lib/i18n';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
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
        <p className="mt-5 text-center text-sm text-stone-600">{footer}</p>
        <p className="mt-3 text-center text-sm">
          <Link to="/browse" className="font-semibold text-stone-500 underline hover:text-stone-800">{t('Just looking? Browse properties as a guest')}</Link>
        </p>
      </div>
    </div>
  );
}

function useAuthForm(path: '/auth/login' | '/auth/register') {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent, payload: Record<string, string>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ token: string; role: Role }>(path, payload);
      signIn(res.token);
      const from = (loc.state as { from?: string } | null)?.from;
      // Send people back where they were; otherwise to the right home for their account type.
      nav(from && (res.role === 'customer' ? !from.startsWith('/app') : true) ? from : res.role === 'customer' ? '/account' : '/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, busy };
}

const homeFor = (role: Role | null) => (role === 'customer' ? '/account' : '/app');

export function LoginPage() {
  const t = useT();
  const { token, role } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, busy } = useAuthForm('/auth/login');
  if (token) return <Navigate to={homeFor(role)} replace />;
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
        <TextInput label={t('Password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
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
  const { submit, error, busy } = useAuthForm('/auth/register');
  if (token) return <Navigate to={homeFor(current)} replace />;
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
        <TextInput label={t('Password')} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} hint={t('At least 8 characters')} />
        <ErrorNote error={error} />
        <Button type="submit" loading={busy} className="w-full">{t('Create account')}</Button>
      </form>
    </AuthLayout>
  );
}
