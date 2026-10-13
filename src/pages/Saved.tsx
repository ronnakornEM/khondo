import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import type { BrowseResponse } from '@shared/types';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFavorites } from '@/lib/favorites';
import { useT } from '@/lib/i18n';
import { MarketCard } from '@/components/MarketCard';
import { RatesNote } from '@/components/Price';
import { SiteHeader } from '@/components/SiteHeader';
import { EmptyState, ErrorNote, LinkButton, PageLoader, btnClass } from '@/components/ui';

/** Saved properties list — the same for guests (this browser) and signed-in users (their account). */
export function SavedList() {
  const t = useT();
  const { ids } = useFavorites();
  const list = [...ids].slice(0, 50);
  const q = useQuery({
    queryKey: ['favorites', list.join(',')],
    queryFn: () => get<BrowseResponse>(`/public/properties?ids=${list.join(',')}`),
    enabled: list.length > 0,
  });
  if (!list.length) return <EmptyState icon={<Heart className="size-6" />} title={t('Nothing saved yet')} text={t('Tap the heart on any property to keep it here.')} action={<LinkButton to="/browse">{t('Browse properties')}</LinkButton>} />;
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorNote error={q.error} />;
  const items = (q.data?.items ?? []).filter((p) => ids.has(p.id));
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((p) => <MarketCard key={p.id} p={p} />)}</div>
      {items.length < list.length && <p className="mt-4 text-sm text-stone-500">{t('Some saved properties are no longer available and are hidden.')}</p>}
      <RatesNote className="mt-6" />
    </>
  );
}

export function SavedPage() {
  const t = useT();
  const { token } = useAuth();
  return (
    <div className="min-h-dvh bg-stone-50">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('Saved properties')}</h1>
        {!token && (
          <div className="mb-5 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <span>{t('You’re browsing as a guest — your saved properties live in this browser. Sign in to keep them on all your devices.')}</span>
            <Link to="/login?role=customer" state={{ from: '/saved' }} className={btnClass('primary', 'sm')}>{t('Sign in')}</Link>
          </div>
        )}
        <div className="mt-5"><SavedList /></div>
      </main>
    </div>
  );
}
