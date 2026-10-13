import { Hono } from 'hono';
import { DISPLAY_CURRENCIES, FALLBACK_RATES, type DisplayCurrency, type RatesResponse } from '../../shared/currency.js';

// Exchange rates for the "show price in my currency" feature. Public, not user-specific, so it is safe to cache.
export const rates = new Hono();

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; data: RatesResponse } | null = null;

export function resetRatesCache() {
  cache = null;
}

async function fetchLive(): Promise<RatesResponse | null> {
  try {
    const url = `https://api.frankfurter.dev/v1/latest?base=THB&symbols=${DISPLAY_CURRENCIES.join(',')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json: any = await res.json();
    const out = {} as Record<DisplayCurrency, number>;
    for (const c of DISPLAY_CURRENCIES) {
      const v = json?.rates?.[c];
      if (typeof v !== 'number' || !(v > 0)) return null; // never serve a partial table
      out[c] = v;
    }
    return { base: 'THB', date: String(json.date ?? new Date().toISOString().slice(0, 10)), rates: out, live: true };
  } catch {
    return null;
  }
}

rates.get('/rates', async (c) => {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const live = await fetchLive();
    if (live) cache = { at: Date.now(), data: live };
    else if (!cache) {
      // First failure: serve approximate rates, but retry soon rather than for a full hour.
      cache = { at: Date.now() - TTL_MS + 60_000, data: { base: 'THB', date: new Date().toISOString().slice(0, 10), rates: FALLBACK_RATES, live: false } };
    } else {
      cache.at = Date.now() - TTL_MS + 60_000; // keep serving stale data, retry in a minute
    }
  }
  c.header('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return c.json(cache.data);
});
