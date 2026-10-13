import { Link, NavLink } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useFavorites } from '@/lib/favorites';
import { useT } from '@/lib/i18n';
import { Logo } from './Logo';
import { PrefsMenu } from './PrefsMenu';
import { btnClass, cx } from './ui';

/** Header for the customer-facing pages (browse, saved, account). Guests see "Sign in"; nobody is forced to log in. */
export function SiteHeader() {
  const t = useT();
  const { token, role } = useAuth();
  const { ids } = useFavorites();
  const link = ({ isActive }: { isActive: boolean }) => cx('rounded-full px-3 py-1.5 text-sm font-semibold', isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-600 hover:bg-stone-100');
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
        <Link to="/" className="mr-2 shrink-0"><Logo /></Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/browse" className={link}>{t('Browse')}</NavLink>
          <NavLink to="/saved" className={link}>
            <span className="inline-flex items-center gap-1"><Heart className="size-4" /><span className="hidden sm:inline">{t('Saved')}</span>{ids.size > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{ids.size}</span>}</span>
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <PrefsMenu />
          {token ? (
            <Link to={role === 'agent' ? '/app' : '/account'} className={btnClass('primary', 'sm')}>{role === 'agent' ? t('Open app') : t('My account')}</Link>
          ) : (
            <Link to="/login" className={btnClass('secondary', 'sm')}>{t('Sign in')}</Link>
          )}
        </div>
      </div>
    </header>
  );
}
