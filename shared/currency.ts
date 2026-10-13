// Prices are stored and shown in Thai baht (THB). Visitors can pick a second currency, which is displayed
// next to the baht price as an estimate. Rates come from /api/rates (ECB data via Frankfurter, cached).

export const BASE_CURRENCY = 'THB';

/** Currencies offered in the picker (all supported by the ECB reference rates). */
export const DISPLAY_CURRENCIES = ['USD', 'EUR', 'CNY', 'GBP', 'JPY', 'KRW', 'SGD', 'AUD', 'HKD', 'MYR', 'INR'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export interface RatesResponse {
  base: typeof BASE_CURRENCY;
  date: string; // YYYY-MM-DD the rates are from
  rates: Record<DisplayCurrency, number>; // 1 THB = rates[X] X
  live: boolean; // false = built-in approximate rates (provider unreachable)
}

/** Approximate 1 THB in X. Only used when the live provider cannot be reached. */
export const FALLBACK_RATES: Record<DisplayCurrency, number> = {
  USD: 0.031,
  EUR: 0.027,
  CNY: 0.22,
  GBP: 0.023,
  JPY: 4.6,
  KRW: 43,
  SGD: 0.04,
  AUD: 0.047,
  HKD: 0.24,
  MYR: 0.13,
  INR: 2.6,
};

export const isDisplayCurrency = (c: string): c is DisplayCurrency => (DISPLAY_CURRENCIES as readonly string[]).includes(c);

/** Rounds an estimate to 3 significant digits above 1,000 so "≈ $52,000" doesn't pretend to be exact. */
export function roundEstimate(n: number): number {
  if (!isFinite(n) || n < 1000) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.round(n / p) * p;
}
