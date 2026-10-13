import { NavLink, Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, Crown, ExternalLink, FileText, Globe, Inbox, LayoutDashboard, LogOut, Menu, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { get } from '@/lib/api';
import type { Inquiry } from '@shared/types';
import { Logo } from './Logo';
import { PageLoader, PremiumBadge, cx } from './ui';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/properties', label: 'Properties', icon: Building2 },
  { to: '/app/page', label: 'My page', icon: Globe },
  { to: '/app/inquiries', label: 'Inquiries', icon: Inbox, badge: true },
  { to: '/app/contacts', label: 'Contacts', icon: Users, premium: true },
  { to: '/app/bills', label: 'Bills', icon: FileText, premium: true },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
];
const TABS = [NAV[0], NAV[1], NAV[6], NAV[3]];

export function AppShell() {
  const { token, me, loading, signOut, isPremium } = useAuth();
  const loc = useLocation();
  const inquiries = useQuery({ queryKey: ['inquiries'], queryFn: () => get<Inquiry[]>('/inquiries'), enabled: !!me });
  const unread = inquiries.data?.filter((i) => !i.handled).length ?? 0;

  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (loading || !me) return <PageLoader />;
  const agent = me.agent;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-stone-200 bg-white p-4 md:flex">
        <Link to="/app" className="mb-6 px-2">
          <Logo />
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-600 hover:bg-stone-100')}
            >
              <n.icon className="size-5" />
              <span className="flex-1">{n.label}</span>
              {n.badge && unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{unread}</span>}
              {n.premium && !isPremium && <Crown className="size-3.5 text-amber-500" />}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-stone-100 pt-3">
          <a href={`/a/${agent.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50">
            <ExternalLink className="size-4" /> View my page
          </a>
          <NavLink to="/app/billing" className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
            <span className="truncate font-semibold">{agent.displayName}</span>
            {isPremium ? <PremiumBadge /> : <span className="text-xs font-semibold text-amber-700">Upgrade</span>}
          </NavLink>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-stone-500 hover:bg-stone-100">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))] backdrop-blur md:hidden">
          <Link to="/app">
            <Logo />
          </Link>
          <Link to="/app/more" className="rounded-full p-2 text-stone-600 hover:bg-stone-100" aria-label="Menu">
            <Menu className="size-6" />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-10">
          <Outlet />
        </main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[var(--safe-bottom)] backdrop-blur md:hidden">
          {TABS.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-brand-700' : 'text-stone-500')}>
              <n.icon className="size-6" />
              {n.label}
              {n.badge && unread > 0 && <span className="absolute right-[28%] top-1 size-2.5 rounded-full bg-red-500" />}
            </NavLink>
          ))}
          <NavLink to="/app/more" className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-brand-700' : 'text-stone-500')}>
            <Menu className="size-6" />
            More
          </NavLink>
        </nav>
      </div>
    </div>
  );
}

/** Mobile "More" screen */
export function MorePage() {
  const { me, signOut, isPremium } = useAuth();
  const items = [NAV[4], NAV[5], NAV[2]];
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold">More</h1>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {items.map((n) => (
          <Link key={n.to} to={n.to} className="flex items-center gap-3 border-b border-stone-100 px-4 py-3.5 last:border-0">
            <n.icon className="size-5 text-brand-700" />
            <span className="flex-1 font-semibold">{n.label}</span>
            {n.premium && !isPremium && <PremiumBadge />}
          </Link>
        ))}
        <Link to="/app/billing" className="flex items-center gap-3 px-4 py-3.5">
          <Crown className="size-5 text-amber-500" />
          <span className="flex-1 font-semibold">Plan & billing</span>
          {isPremium ? <PremiumBadge /> : <span className="text-xs font-semibold text-amber-700">Free</span>}
        </Link>
      </div>
      <a href={`/a/${me!.agent.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 font-semibold text-brand-800">
        <ExternalLink className="size-5" /> View my public page
      </a>
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 font-semibold text-stone-600">
        <LogOut className="size-5" /> Sign out
      </button>
    </div>
  );
}
