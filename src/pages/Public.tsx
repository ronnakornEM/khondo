import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bath, BedDouble, Building2, Check, ChevronLeft, ChevronRight, Layers, MapPin, Ruler } from 'lucide-react';
import type { Property, PublicAgentResponse } from '@shared/types';
import { ApiError, get } from '@/lib/api';
import { mapsUrl, tEnum } from '@/lib/format';
import { PriceLabel, RatesNote } from '@/components/Price';
import { PrefsMenu } from '@/components/PrefsMenu';
import { AgentSite, Branding, ContactButtons, InquiryForm, onColor } from '@/components/AgentSite';
import { PageLoader } from '@/components/ui';
import { useT } from '@/lib/i18n';

function useTitle(title: string) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

function NotFoundPage() {
  const t = useT();
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <Building2 className="mx-auto size-12 text-stone-300" />
        <h1 className="mt-3 text-xl font-extrabold">{t('This page doesn’t exist')}</h1>
        <p className="mt-1 text-stone-500">{t('The link may be wrong, or the listing was removed.')}</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-brand-700 underline">{t('Go to Khondo')}</Link>
      </div>
    </div>
  );
}

export function PublicAgentPage() {
  const t = useT();
  const { slug } = useParams();
  const q = useQuery({ queryKey: ['public', slug], queryFn: () => get<PublicAgentResponse>(`/public/agents/${slug}`), retry: false });
  useTitle(q.data ? `${q.data.agent.displayName} — ${q.data.agent.headline || t('Real estate')}` : '');
  if (q.isLoading) return <PageLoader />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.error || !q.data) return <div className="p-10 text-center text-stone-500">{t('Could not load this page. Please try again.')}</div>;
  return <AgentSite agent={q.data.agent} properties={q.data.properties} />;
}

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const t = useT();
  const [i, setI] = useState(0);
  if (!photos.length) return <div className="grid aspect-[16/10] place-items-center rounded-3xl bg-stone-100 text-stone-300"><Building2 className="size-16" /></div>;
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-stone-100">
        <img src={photos[i]} alt={`${title} – photo ${i + 1}`} className="size-full object-cover" />
        {photos.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label={t('Previous photo')} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"><ChevronLeft className="size-5" /></button>
            <button onClick={() => go(1)} aria-label={t('Next photo')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"><ChevronRight className="size-5" /></button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">{i + 1} / {photos.length}</span>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, n) => (
            <button key={p + n} onClick={() => setI(n)} className={`size-16 shrink-0 overflow-hidden rounded-xl ring-2 sm:size-20 ${n === i ? 'ring-[var(--accent)]' : 'ring-transparent opacity-70'}`}><img src={p} alt="" className="size-full object-cover" loading="lazy" /></button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PublicPropertyPage() {
  const t = useT();
  const { slug, id } = useParams();
  const q = useQuery({ queryKey: ['public', slug, id], queryFn: () => get<{ agent: PublicAgentResponse['agent']; property: Property }>(`/public/agents/${slug}/properties/${id}`), retry: false });
  useTitle(q.data ? `${q.data.property.title} — ${q.data.agent.displayName}` : '');
  if (q.isLoading) return <PageLoader />;
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPage />;
  if (q.error || !q.data) return <div className="p-10 text-center text-stone-500">{t('Could not load this listing.')}</div>;
  const { agent, property: p } = q.data;
  const accent = agent.landing.accent;
  const dark = agent.landing.theme === 'modern';
  const map = mapsUrl(p);
  const specs = [
    p.bedrooms != null && { icon: BedDouble, label: 'Bedrooms', value: p.bedrooms },
    p.bathrooms != null && { icon: Bath, label: 'Bathrooms', value: p.bathrooms },
    p.areaSqm != null && { icon: Ruler, label: 'Area', value: `${p.areaSqm} m²` },
    p.landSqw != null && { icon: Ruler, label: 'Land', value: `${p.landSqw} ตร.ว.` },
    p.floor != null && { icon: Layers, label: 'Floor', value: p.floor },
  ].filter(Boolean) as { icon: typeof Bath; label: string; value: string | number }[];

  return (
    <div className={`min-h-dvh ${dark ? 'bg-stone-950 text-stone-100' : 'bg-stone-50 text-stone-900'}`} style={{ '--accent': accent } as React.CSSProperties}>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-3"><Link to={`/a/${agent.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold opacity-70 hover:opacity-100"><ArrowLeft className="size-4" /> {agent.displayName}</Link><PrefsMenu tone={dark ? 'dark' : 'light'} /></div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Gallery photos={p.photos} title={p.title} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: accent, color: onColor(accent) }}>{p.status === 'available' ? (p.listingType === 'rent' ? t('For rent') : p.listingType === 'sale' ? t('For sale') : t('For sale / rent')) : tEnum(p.status)}</span>
                <span className="text-sm opacity-60">{tEnum(p.type)}</span>
              </div>
              <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{p.title}</h1>
              <div className="mt-1 text-2xl font-extrabold" style={{ color: dark ? undefined : accent }}><PriceLabel p={p} /></div>
              <RatesNote className="mt-1" />
              {(p.address || p.district) && (
                <p className="mt-2 flex items-start gap-1.5 text-sm opacity-70"><MapPin className="mt-0.5 size-4 shrink-0" />
                  <span>{[p.address, p.district, p.province].filter(Boolean).join(', ')}{map && <> · <a href={map} target="_blank" rel="noreferrer" className="font-semibold underline">{t('Open in Maps')}</a></>}</span>
                </p>
              )}
            </div>
            {specs.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {specs.map((s) => (
                  <div key={s.label} className={`rounded-2xl p-3 ${dark ? 'bg-stone-900' : 'border border-stone-200 bg-white'}`}>
                    <s.icon className="size-5 opacity-60" />
                    <div className="mt-1 text-lg font-extrabold">{s.value}</div>
                    <div className="text-xs opacity-60">{t(s.label)}</div>
                  </div>
                ))}
              </div>
            )}
            {p.description && <div><h2 className="mb-2 text-lg font-bold">{t('About this property')}</h2><p className="whitespace-pre-line leading-relaxed opacity-80">{p.description}</p></div>}
            {p.amenities.length > 0 && (
              <div>
                <h2 className="mb-2 text-lg font-bold">{t('Amenities')}</h2>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                  {p.amenities.map((a) => <li key={a} className="flex items-center gap-2"><Check className="size-4" style={{ color: accent }} />{a}</li>)}
                </ul>
              </div>
            )}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            <div className={`rounded-3xl p-5 ${dark ? 'bg-stone-900' : 'border border-stone-200 bg-white shadow-sm'}`}>
              <div className="flex items-center gap-3">
                {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="size-14 rounded-full object-cover" /> : <div className="grid size-14 place-items-center rounded-full text-xl font-extrabold" style={{ background: accent, color: onColor(accent) }}>{agent.displayName.charAt(0).toUpperCase()}</div>}
                <div><div className="font-extrabold">{agent.displayName}</div><div className="text-sm opacity-60">{agent.headline}</div></div>
              </div>
              <ContactButtons agent={agent} accent={accent} className="mt-4" />
            </div>
            <div>
              <h2 className="mb-2 font-bold">{t('Ask about this property')}</h2>
              <InquiryForm slug={agent.slug} propertyId={p.id} accent={accent} theme={agent.landing.theme} />
            </div>
          </aside>
        </div>
        <Branding show={agent.showBranding} theme={agent.landing.theme} />
      </div>
    </div>
  );
}
