import { Link } from 'react-router-dom';
import { Bath, BedDouble, Building2, MapPin, Ruler } from 'lucide-react';
import type { PropertyWithAgent } from '@shared/types';
import { tEnum } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { FavButton } from './FavButton';
import { PriceLabel } from './Price';

const STATUS: Record<string, string> = { available: 'bg-emerald-500 text-white', reserved: 'bg-amber-400 text-amber-950', sold: 'bg-stone-800 text-white', rented: 'bg-sky-600 text-white' };

/** Marketplace card: the whole card opens the listing, the agent chip opens the agent's landing page. */
export function MarketCard({ p }: { p: PropertyWithAgent }) {
  const t = useT();
  const label = p.status === 'available' ? (p.listingType === 'rent' ? t('For rent') : p.listingType === 'sale' ? t('For sale') : t('For sale / rent')) : tEnum(p.status);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {p.photos[0] ? <img src={p.photos[0]} alt={p.title} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid size-full place-items-center text-stone-300"><Building2 className="size-12" /></div>}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[p.status]}`}>{label}</span>
        <FavButton id={p.id} className="absolute right-3 top-3 z-10" />
      </div>
      <div className="p-4">
        <div className="text-lg font-extrabold text-brand-800"><PriceLabel p={p} /></div>
        <h3 className="mt-0.5 line-clamp-1 font-semibold">
          <Link to={`/a/${p.agent.slug}/p/${p.id}`} className="after:absolute after:inset-0">{p.title}</Link>
        </h3>
        {(p.district || p.province) && <p className="mt-0.5 flex items-center gap-1 text-sm text-stone-500"><MapPin className="size-3.5" />{[p.district, p.province].filter(Boolean).join(', ')}</p>}
        <div className="mt-3 flex gap-4 text-sm text-stone-500">
          {p.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble className="size-4" />{p.bedrooms}</span>}
          {p.bathrooms != null && <span className="inline-flex items-center gap-1"><Bath className="size-4" />{p.bathrooms}</span>}
          {p.areaSqm != null && <span className="inline-flex items-center gap-1"><Ruler className="size-4" />{p.areaSqm} {t('m²')}</span>}
          {p.landSqw != null && p.areaSqm == null && <span className="inline-flex items-center gap-1"><Ruler className="size-4" />{p.landSqw} {t('ตร.ว.')}</span>}
        </div>
        <Link to={`/a/${p.agent.slug}`} className="relative z-10 mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 text-sm text-stone-600 hover:text-brand-800">
          {p.agent.avatarUrl ? <img src={p.agent.avatarUrl} alt="" className="size-6 rounded-full object-cover" /> : <span className="grid size-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{p.agent.displayName.charAt(0).toUpperCase()}</span>}
          <span className="truncate font-semibold">{p.agent.displayName}</span>
        </Link>
      </div>
    </article>
  );
}
