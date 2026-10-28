import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { post } from '@/lib/api';
import { useAuth, type Role } from '@/lib/auth';
import { useI18n, useT } from '@/lib/i18n';
import { Button, ErrorNote, Spinner, TextInput, btnClass } from '@/components/ui';
import { AuthLayout } from './Auth';

/** Landing page of the link in the verification email: /verify-email?token=… */
export function VerifyEmailPage() {
  const t = useT();
  const { lang } = useI18n();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'ok' | 'failed'>('working');
  const [error, setError] = useState<unknown>(null);
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);
  const ran = useRef(false); // React StrictMode runs effects twice; the token is single-use

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    post<{ token: string; role: Role }>('/auth/verify-email', { token })
      .then((res) => {
        setState('ok');
        signIn(res.token);
        setTimeout(() => nav(res.role === 'customer' ? '/account' : '/app', { replace: true }), 1200);
      })
      .catch((e) => {
        setError(e);
        setState('failed');
      });
  }, [token, signIn, nav]);

  if (!token) return <Navigate to="/login" replace />;

  const resend = async () => {
    try {
      await post('/auth/resend-verification', { email, lang });
    } finally {
      setResent(true);
    }
  };

  return (
    <AuthLayout title={t('Email verification')} subtitle="">
      {state === 'working' && (
        <div className="flex items-center justify-center gap-3 py-6 text-stone-600" role="status"><Spinner /> {t('Verifying your email…')}</div>
      )}
      {state === 'ok' && (
        <div className="space-y-2 py-4 text-center" role="status">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
          <p className="font-bold">{t('Email verified!')}</p>
          <p className="text-sm text-stone-500">{t('Taking you to your account…')}</p>
        </div>
      )}
      {state === 'failed' && (
        <div className="space-y-4">
          <div className="text-center"><XCircle className="mx-auto size-12 text-red-500" /></div>
          <ErrorNote error={error} />
          {resent ? (
            <p className="text-sm font-semibold text-emerald-700" role="status">{t('If that address has an account waiting for verification, we just sent a new link.')}</p>
          ) : (
            <>
              <p className="text-sm text-stone-600">{t('Enter your email and we’ll send you a new link.')}</p>
              <TextInput label={t('Email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button className="w-full" disabled={!email.includes('@')} onClick={resend}>{t('Send a new link')}</Button>
            </>
          )}
          <Link to="/login" className={btnClass('ghost', 'md', 'w-full')}>{t('Back to sign in')}</Link>
        </div>
      )}
    </AuthLayout>
  );
}
