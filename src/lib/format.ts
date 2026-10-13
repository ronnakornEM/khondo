import { format, parseISO, isValid } from 'date-fns';
import { dateFnsLocale, translate, getLang } from './i18n';

// Intl's THB currency style prints "THB 1,000" in most locales; agents expect the ฿ symbol.
const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thb = { format: (n: number) => (n < 0 ? '-' : '') + '฿' + num0.format(Math.abs(n)) };
const thb2 = { format: (n: number) => (n < 0 ? '-' : '') + '฿' + num2.format(Math.abs(n)) };

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const money = (n: number | null | undefined) => (n == null ? '—' : thb.format(n));
export const money2 = (n: number | null | undefined) => (n == null ? '—' : thb2.format(n));

export function compactMoney(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `฿${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `฿${Math.round(n / 1000)}K`;
  return thb.format(n);
}

/** Human-readable date in the active UI language (month/day names localised). */
export function fmt(date: Date, pattern: string) {
  // Thai dates use the Buddhist Era (พ.ศ. = CE + 543); date-fns only knows CE, so substitute the year as a literal.
  const p = getLang() === 'th' ? pattern.replace(/y+/g, `'${date.getFullYear() + 543}'`) : pattern;
  return format(date, p, { locale: dateFnsLocale() });
}

export function dateLabel(iso: string | null | undefined, pattern = 'd MMM yyyy') {
  if (!iso) return '—';
  const d = parseISO(iso);
  return isValid(d) ? fmt(d, pattern) : '—';
}

/** Translates an enum value such as 'available' or 'negotiating' (dictionary keys are the Title-cased English word). */
export const tEnum = (v: string) => translate(getLang(), titleCase(v));


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
