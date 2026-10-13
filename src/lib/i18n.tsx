import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { enUS, th as dfTh, zhCN as dfZh } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { th } from '@/locales/th';
import { zh } from '@/locales/zh';

// Tiny dependency-free i18n. The English text IS the key:  t('Add property')  /  t('Hi, {name}', { name }).
// Missing translations fall back to English, so a forgotten string is never blank (dev mode logs them).

export type Lang = 'th' | 'en' | 'zh';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'th', label: 'ไทย' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
];

const DICTS: Record<Lang, Record<string, string>> = { en: {}, th, zh };
const INTL: Record<Lang, string> = { en: 'en-US', th: 'th-TH', zh: 'zh-CN' };
const DATE_LOCALE: Record<Lang, Locale> = { en: enUS, th: dfTh, zh: dfZh };
const STORAGE_KEY = 'khondo.lang';

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'th' || saved === 'en' || saved === 'zh') return saved;
  } catch {
    /* storage unavailable */
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.toLowerCase();
    if (code.startsWith('th')) return 'th';
    if (code.startsWith('zh')) return 'zh';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}

// Module-level mirror of the active language so plain functions (date formatting) can read it.
let activeLang: Lang = 'en';
export const getLang = () => activeLang;
export const dateFnsLocale = () => DATE_LOCALE[activeLang];
export const intlLocale = () => INTL[activeLang];

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let out = DICTS[lang][key];
  if (out === undefined) {
    out = key;
    if (import.meta.env.DEV && lang !== 'en') {
      const w = window as unknown as { __i18nMissing?: Set<string> };
      (w.__i18nMissing ??= new Set()).add(key);
    }
  }
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
  intl: string;
}
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = detectLang();
    activeLang = l;
    return l;
  });

  const setLang = useCallback((l: Lang) => {
    activeLang = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  }, []);

  useEffect(() => {
    activeLang = lang;
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<Ctx>(() => ({ lang, setLang, intl: INTL[lang], t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const v = useContext(I18nCtx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
export const useT = () => useI18n().t;
