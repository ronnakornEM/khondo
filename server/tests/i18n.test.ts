import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { th } from '../../src/locales/th.js';
import { zh } from '../../src/locales/zh.js';
import { PROPERTY_TYPES, LISTING_TYPES, PROPERTY_STATUSES, CONTACT_KINDS, CONTACT_STAGES, BILL_KINDS, BILL_STATUSES, EVENT_KINDS, RECURRENCES, LANDING_THEMES } from '../../shared/types.js';
import { DISPLAY_CURRENCIES, roundEstimate } from '../../shared/currency.js';

const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sourceKeys(dir: string): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'locales') for (const k of sourceKeys(p)) out.add(k);
    } else if (/\.tsx?$/.test(f)) {
      const s = readFileSync(p, 'utf8');
      for (const m of s.matchAll(/(?<![A-Za-z0-9_.$])t\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) out.add((m[1] ?? m[2]).replace(/\\'/g, "'"));
    }
  }
  return out;
}

describe('translations', () => {
  it('Thai and Chinese cover the same keys with the same placeholders', () => {
    assert.deepEqual(Object.keys(th).sort(), Object.keys(zh).sort());
    for (const k of Object.keys(th)) {
      assert.equal(ph(th[k]), ph(k), `th placeholders differ: ${k}`);
      assert.equal(ph(zh[k]), ph(k), `zh placeholders differ: ${k}`);
      assert.ok(th[k].trim() && zh[k].trim(), `empty translation: ${k}`);
    }
  });

  it('every t("…") string used in the app has a Thai and Chinese entry', () => {
    const missing = [...sourceKeys('src')].filter((k) => !(k in th) || !(k in zh));
    assert.deepEqual(missing, []);
  });

  it('every enum label rendered through tEnum() is translated', () => {
    const all = [...PROPERTY_TYPES, ...LISTING_TYPES, ...PROPERTY_STATUSES, ...CONTACT_KINDS, ...CONTACT_STAGES, ...BILL_KINDS, ...BILL_STATUSES, ...EVENT_KINDS, ...RECURRENCES, ...LANDING_THEMES, 'month', 'week', 'day', 'edit', 'preview', 'overdue'];
    const missing = all.map(cap).filter((k) => !(k in th) || !(k in zh));
    assert.deepEqual(missing, []);
  });
});

describe('currency helpers', () => {
  it('rounds estimates to 3 significant digits above 1,000', () => {
    assert.equal(roundEstimate(0), 0);
    assert.equal(roundEstimate(999.6), 1000);
    assert.equal(roundEstimate(58623), 58600);
    assert.equal(roundEstimate(1_234_567), 1_230_000);
    assert.equal(roundEstimate(6_981_234), 6_980_000);
  });
  it('formats every offered currency in each UI language', () => {
    for (const locale of ['en-US', 'th-TH', 'zh-CN']) {
      for (const c of DISPLAY_CURRENCIES) {
        const out = new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(58600);
        assert.match(out, /58,600|58600/, `${locale} ${c} -> ${out}`);
      }
    }
  });
});
