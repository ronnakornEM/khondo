import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { PrefsMenu } from '@/components/PrefsMenu';
import { Button, ErrorNote, TextInput } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
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
      const res = await post<{ token: string }>(path, payload);
      signIn(res.token);
      nav((loc.state as { from?: string } | null)?.from ?? '/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, busy };
}

export function LoginPage() {
  const t = useT();
  const { token } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, busy } = useAuthForm('/auth/login');
  if (token) return <Navigate to="/app" replace />;
  return (
    <AuthLayout
      title={t('Welcome back')}
      subtitle={t('Sign in to manage your portfolio.')}
      footer={
        <>{t('New to Khondo?')}{' '}
          <Link to="/register" className="font-semibold text-brand-700 underline">{t('Create a free account')}</Link>
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
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, busy } = useAuthForm('/auth/register');
  if (token) return <Navigate to="/app" replace />;
  return (
    <AuthLayout
      title={t('Create your free account')}
      subtitle={t('Build your portfolio and landing page in minutes.')}
      footer={
        <>{t('Already have an account?')}{' '}
          <Link to="/login" className="font-semibold text-brand-700 underline">{t('Sign in')}</Link>
        </>
      }
    >
      <form onSubmit={(e) => submit(e, { name, email, password })} className="space-y-4">
        <TextInput label={t('Your name or agency')} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput label={t('Email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label={t('Password')} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} hint={t('At least 8 characters')} />
        <ErrorNote error={error} />
        <Button type="submit" loading={busy} className="w-full">{t('Create account')}</Button>
      </form>
    </AuthLayout>
  );
}
