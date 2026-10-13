import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, SearchX } from 'lucide-react';
import { PROPERTY_TYPES, type BrowseResponse } from '@shared/types';
import { get } from '@/lib/api';
import { tEnum } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { MarketCard } from '@/components/MarketCard';
import { RatesNote } from '@/components/Price';
import { SiteHeader } from '@/components/SiteHeader';
import { Button, EmptyState, ErrorNote, PageLoader, Spinner, cx } from '@/components/ui';

const field = 'rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20';

/** Public marketplace: every live listing from every agent. No account needed. */
export function BrowsePage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const get1 = (k: string) => params.get(k) ?? '';
  const [q, setQ] = useState(get1('q'));

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    if ('listing' in patch && !patch.listing) { next.delete('min'); next.delete('max'); }
    setParams(next, { replace: true });
  };

  // debounce free-text search into the URL
  useEffect(() => {
    if (q === get1('q')) return;
    const id = setTimeout(() => set({ q }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const qs = params.toString();
  const res = useQuery({ queryKey: ['browse', qs], queryFn: () => get<BrowseResponse>(`/public/properties?${qs}`), placeholderData: keepPreviousData });
  const page = Number(get1('page') || 1);
  const pages = res.data ? Math.max(1, Math.ceil(res.data.total / res.data.pageSize)) : 1;
  const listing = get1('listing');
  const active = ['q', 'type', 'listing', 'min', 'max', 'beds'].some((k) => get1(k));

  return (
    <div className="min-h-dvh bg-stone-50">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('Find your next home in Khon Kaen')}</h1>
        <p className="mt-1 text-stone-500">{t('Browse condos, houses and land from local agents — no account needed.')}</p>

        <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search by area, project, agent…')} aria-label={t('Search')} className={cx(field, 'w-full pl-9')} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <select aria-label={t('Listing')} value={listing} onChange={(e) => set({ listing: e.target.value })} className={field}>
              <option value="">{t('Buy or rent')}</option>
              <option value="sale">{t('For sale')}</option>
              <option value="rent">{t('For rent')}</option>
            </select>
            <select aria-label={t('Property type')} value={get1('type')} onChange={(e) => set({ type: e.target.value })} className={field}>
              <option value="">{t('All types')}</option>
              {PROPERTY_TYPES.map((x) => <option key={x} value={x}>{tEnum(x)}</option>)}
            </select>
            <select aria-label={t('Bedrooms')} value={get1('beds')} onChange={(e) => set({ beds: e.target.value })} className={field}>
              <option value="">{t('Any bedrooms')}</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}
            </select>
            <select aria-label={t('Sort by')} value={get1('sort')} onChange={(e) => set({ sort: e.target.value })} className={field}>
              <option value="">{t('Newest first')}</option>
              <option value="price_asc">{t('Price: low to high')}</option>
              <option value="price_desc">{t('Price: high to low')}</option>
            </select>
            {listing && (
              <>
                <input inputMode="numeric" aria-label={t('Min price (฿)')} placeholder={t('Min price (฿)')} value={get1('min')} onChange={(e) => set({ min: e.target.value.replace(/\D/g, '') })} className={field} />
                <input inputMode="numeric" aria-label={t('Max price (฿)')} placeholder={t('Max price (฿)')} value={get1('max')} onChange={(e) => set({ max: e.target.value.replace(/\D/g, '') })} className={field} />
              </>
            )}
          </div>
          {active && (
            <button onClick={() => { setQ(''); setParams({}, { replace: true }); }} className="mt-3 text-sm font-semibold text-brand-700 underline">{t('Clear filters')}</button>
          )}
        </div>

        <div className="mb-3 mt-6 flex items-center justify-between">
          <p className="text-sm font-semibold text-stone-600" aria-live="polite">{res.data ? t('{count} properties', { count: res.data.total.toLocaleString() }) : ' '}</p>
          {res.isFetching && !res.isLoading && <Spinner className="size-4" />}
        </div>

        {res.isLoading ? <PageLoader /> : res.error ? <ErrorNote error={res.error} /> : !res.data?.items.length ? (
          <EmptyState icon={<SearchX className="size-6" />} title={t('No properties match your search')} text={t('Try removing a filter or searching a wider area.')} action={active && <Button variant="secondary" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>{t('Clear filters')}</Button>} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {res.data.items.map((p) => <MarketCard key={p.id} p={p} />)}
          </div>
        )}

        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label={t('Pagination')}>
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => { set({ page: String(page - 1) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><ChevronLeft className="size-4" />{t('Previous')}</Button>
            <span className="text-sm font-semibold text-stone-600">{t('Page {page} of {pages}', { page, pages })}</span>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => { set({ page: String(page + 1) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('Next')}<ChevronRight className="size-4" /></Button>
          </nav>
        )}
        <RatesNote className="mt-6" />
      </main>
    </div>
  );
}
