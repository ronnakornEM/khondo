import { HttpError } from './http.js';

// Minimal Stripe REST client (plain fetch keeps the serverless bundle small).
// STRIPE_API_BASE exists so tests (and Stripe's own mock servers) can stand in for api.stripe.com.

export const PRICE_LOOKUP_KEY = 'khondo_premium_monthly';

const base = () => (process.env.STRIPE_API_BASE ?? 'https://api.stripe.com/v1').replace(/\/$/, '');
export const stripeKey = () => process.env.STRIPE_SECRET_KEY;
export const stripeEnabled = () => !!stripeKey();

/** 'test' for sandbox keys (sk_test_… / rk_test_…), 'live' otherwise. */
export const stripeMode = (): 'test' | 'live' => (/^(sk|rk)_test_/.test(stripeKey() ?? '') ? 'test' : 'live');

export async function stripeRequest<T = any>(method: 'GET' | 'POST', path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${base()}/${path}${method === 'GET' && qs ? `?${qs}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${stripeKey()}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? new URLSearchParams(params) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, 'Could not reach the payment provider', 'stripe_error');
  }
  const json: any = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(502, json?.error?.message ?? 'Payment provider error', 'stripe_error');
  return json;
}

let cachedPrice: { key: string; id: string } | null = null;

/** STRIPE_PRICE_ID if set, otherwise the active price with lookup key `khondo_premium_monthly` (created by `npm run stripe:setup`). */
export async function resolvePriceId(): Promise<string> {
  if (process.env.STRIPE_PRICE_ID) return process.env.STRIPE_PRICE_ID;
  if (cachedPrice && cachedPrice.key === stripeKey()) return cachedPrice.id;
  const list = await stripeRequest<{ data: { id: string }[] }>('GET', 'prices', { 'lookup_keys[]': PRICE_LOOKUP_KEY, active: 'true', limit: '1' });
  const id = list.data?.[0]?.id;
  if (!id) throw new HttpError(501, 'No Stripe price found. Run "npm run stripe:setup" or set STRIPE_PRICE_ID.', 'billing_disabled');
  cachedPrice = { key: stripeKey()!, id };
  return id;
}

export function resetStripeCache() {
  cachedPrice = null;
}
