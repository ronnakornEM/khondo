import { Link } from 'react-router-dom';
import { Bath, BedDouble, Building2, EyeOff, Ruler, Star } from 'lucide-react';
import type { Property, PropertyStatus } from '@shared/types';
import { tEnum } from '@/lib/format';
import { PriceLabel } from './Price';
import { Badge } from './ui';
import { useT } from '@/lib/i18n';

export const STATUS_TONE: Record<PropertyStatus, 'green' | 'amber' | 'gray' | 'blue'> = { available: 'green', reserved: 'amber', sold: 'gray', rented: 'blue' };

export function PropertyCard({ p, to }: { p: Property; to: string }) {
  const t = useT();
  return (
    <Link to={to} className="group overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] bg-stone-100">
        {p.photos[0] ? (
          <img src={p.photos[0]} alt="" className="size-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div className="grid size-full place-items-center text-stone-300">
            <Building2 className="size-12" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <Badge tone={STATUS_TONE[p.status]}>{tEnum(p.status)}</Badge>
          {!p.published && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-800 px-2.5 py-0.5 text-xs font-semibold text-white">
              <EyeOff className="size-3" /> {t('Hidden')}</span>
          )}
        </div>
        {p.featured && <Star className="absolute right-2 top-2 size-5 fill-amber-400 text-amber-500 drop-shadow" />}
      </div>
      <div className="p-3.5">
        <div className="font-extrabold text-brand-800"><PriceLabel p={p} /></div>
        <div className="mt-0.5 truncate font-semibold">{p.title}</div>
        <div className="truncate text-xs text-stone-500">{[p.district, p.province].filter(Boolean).join(', ') || tEnum(p.type)}</div>
        <div className="mt-2 flex gap-3 text-xs text-stone-600">
          {p.bedrooms != null && (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="size-3.5" /> {p.bedrooms}
            </span>
          )}
          {p.bathrooms != null && (
            <span className="inline-flex items-center gap-1">
              <Bath className="size-3.5" /> {p.bathrooms}
            </span>
          )}
          {p.areaSqm != null && (
            <span className="inline-flex items-center gap-1">
              <Ruler className="size-3.5" /> {p.areaSqm} {t('m²')}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
