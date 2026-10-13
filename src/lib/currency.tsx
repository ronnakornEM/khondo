import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BASE_CURRENCY, isDisplayCurrency, roundEstimate, type DisplayCurrency, type RatesResponse } from '@shared/currency';
import { get } from './api';
import { useI18n } from './i18n';

// THB is always the price of record. The viewer may pick ONE extra currency; it is shown beside the baht price.

const STORAGE_KEY = 'khondo.currency';
export type CurrencyChoice = typeof BASE_CURRENCY | DisplayCurrency;

interface Ctx {
  currency: CurrencyChoice;
  setCurrency: (c: CurrencyChoice) => void;
  rates: RatesResponse | undefined;
  /** "US$58,600" for a baht amount, or null when only baht is selected / rates are not loaded yet. */
  convert: (thb: number | null | undefined) => string | null;
}
const CurrencyCtx = createContext<Ctx | null>(null);

function readSaved(): CurrencyChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && isDisplayCurrency(v)) return v;
  } catch {
    /* ignore */
  }
  return BASE_CURRENCY;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { intl } = useI18n();
  const [currency, setState] = useState<CurrencyChoice>(readSaved);
  const setCurrency = useCallback((c: CurrencyChoice) => {
    try {
      if (c === BASE_CURRENCY) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore */
    }
    setState(c);
  }, []);

  const ratesQ = useQuery({
    queryKey: ['rates'],
    queryFn: () => get<RatesResponse>('/rates'),
    enabled: currency !== BASE_CURRENCY,
    staleTime: 60 * 60 * 1000,
  });

  const value = useMemo<Ctx>(() => {
    const rate = currency !== BASE_CURRENCY ? ratesQ.data?.rates[currency] : undefined;
    const nf = currency !== BASE_CURRENCY ? new Intl.NumberFormat(intl, { style: 'currency', currency, maximumFractionDigits: 0 }) : null;
    return {
      currency,
      setCurrency,
      rates: ratesQ.data,
      convert: (thb) => (thb == null || !rate || !nf ? null : nf.format(roundEstimate(thb * rate))),
    };
  }, [currency, setCurrency, ratesQ.data, intl]);

  return <CurrencyCtx.Provider value={value}>{children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const v = useContext(CurrencyCtx);
  if (!v) throw new Error('useCurrency outside CurrencyProvider');
  return v;
}
