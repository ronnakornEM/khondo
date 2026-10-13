import type { Property } from '@shared/types';
import { useCurrency } from '@/lib/currency';
import { useT } from '@/lib/i18n';
import { money } from '@/lib/format';
import { cx } from './ui';

type Priced = Pick<Property, 'listingType' | 'price' | 'rentPrice'>;

/** Baht price (the price of record) with the viewer's chosen currency shown beside it as an estimate. */
export function PriceLabel({ p, className, convClassName }: { p: Priced; className?: string; convClassName?: string }) {
  const t = useT();
  const { convert } = useCurrency();
  const parts: { thb: string; conv: string | null }[] = [];
  if (p.listingType !== 'rent' && p.price != null) parts.push({ thb: money(p.price), conv: convert(p.price) });
  if (p.listingType !== 'sale' && p.rentPrice != null) {
    const c = convert(p.rentPrice);
    parts.push({ thb: `${money(p.rentPrice)}${t('/mo')}`, conv: c ? `${c}${t('/mo')}` : null });
  }
  if (!parts.length) return <span className={className}>{t('Price on request')}</span>;
  return (
    <span className={cx('flex flex-wrap items-baseline gap-x-2.5 gap-y-0', className)}>
      {parts.map((x, i) => (
        <span key={i} className="inline-flex flex-wrap items-baseline gap-x-1.5">
          <span>{x.thb}</span>
          {x.conv && <span className={cx('whitespace-nowrap text-[0.62em] font-semibold opacity-70', convClassName)}>≈ {x.conv}</span>}
        </span>
      ))}
    </span>
  );
}

/** Small footnote shown on public pages when a second currency is active. */
export function RatesNote({ className }: { className?: string }) {
  const t = useT();
  const { currency, rates } = useCurrency();
  if (currency === 'THB' || !rates) return null;
  return (
    <p className={cx('text-xs opacity-60', className)}>
      {rates.live ? t('Converted prices are estimates based on exchange rates from {date}. The price in Thai baht (฿) is the price of record.', { date: rates.date }) : t('Converted prices are approximate. The price in Thai baht (฿) is the price of record.')}
    </p>
  );
}
