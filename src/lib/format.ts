import { format, parseISO, isValid } from 'date-fns';

// Intl's THB currency style prints "THB 1,000" in most locales; agents expect the ฿ symbol.
const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thb = { format: (n: number) => (n < 0 ? '-' : '') + '฿' + num0.format(Math.abs(n)) };
const thb2 = { format: (n: number) => (n < 0 ? '-' : '') + '฿' + num2.format(Math.abs(n)) };

export const money = (n: number | null | undefined) => (n == null ? '—' : thb.format(n));
export const money2 = (n: number | null | undefined) => (n == null ? '—' : thb2.format(n));

export function compactMoney(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `฿${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `฿${Math.round(n / 1000)}K`;
  return thb.format(n);
}

export function priceLabel(p: { listingType: string; price: number | null; rentPrice: number | null }) {
  const parts: string[] = [];
  if (p.listingType !== 'rent' && p.price != null) parts.push(money(p.price));
  if (p.listingType !== 'sale' && p.rentPrice != null) parts.push(`${money(p.rentPrice)}/mo`);
  return parts.length ? parts.join('  ·  ') : 'Price on request';
}

export function dateLabel(iso: string | null | undefined, fmt = 'd MMM yyyy') {
  if (!iso) return '—';
  const d = parseISO(iso);
  return isValid(d) ? format(d, fmt) : '—';
}

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function whatsappLikeTel(phone: string) {
  return phone.replace(/[^\d+]/g, '');
}

export function lineUrl(lineId: string) {
  const id = lineId.trim();
  if (!id) return '';
  return `https://line.me/ti/p/${id.startsWith('@') ? '~' + id.slice(1) : '~' + id}`;
}

export function mapsUrl(p: { latitude: number | null; longitude: number | null; address: string; district: string; province: string }) {
  const q = p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : [p.address, p.district, p.province].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

/** <input type="datetime-local"> helpers (local time, no timezone suffix) */
export const toLocalInput = (iso: string) => format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
export const fromLocalInput = (v: string) => new Date(v).toISOString();
