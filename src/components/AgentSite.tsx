import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bath, BedDouble, Building2, Globe, Mail, MapPin, MessageCircle, Phone, Ruler, Send } from 'lucide-react';
import type { LandingSettings, Property, PublicAgentResponse } from '@shared/types';
import { lineUrl, tEnum, whatsappLikeTel } from '@/lib/format';
import { PriceLabel, RatesNote } from './Price';
import { PrefsMenu } from './PrefsMenu';
import { ApiError, post } from '@/lib/api';
import { errorText } from '@/lib/errors';
import { LogoMark } from './Logo';
import { useT } from '@/lib/i18n';

type SiteAgent = PublicAgentResponse['agent'];

const Facebook = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-1 .4-1.7 1.8-1.7h1.6V3.8c-.3 0-1.3-.2-2.4-.2-2.5 0-4.2 1.5-4.2 4.3v2.6H7.5v3.3h2.8V22h3.2z" /></svg>
);
const Instagram = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
);

export function onColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1c1917' : '#ffffff';
}

const STATUS_STYLE: Record<string, string> = {
  available: 'bg-emerald-500 text-white',
  reserved: 'bg-amber-400 text-amber-950',
  sold: 'bg-stone-800 text-white',
  rented: 'bg-sky-600 text-white',
};

function themeClasses(theme: LandingSettings['theme']) {
  switch (theme) {
    case 'modern':
      return { page: 'bg-stone-950 text-stone-100', card: 'rounded-3xl bg-stone-900 border border-stone-800', muted: 'text-stone-400', input: 'bg-stone-800 border-stone-700 text-white placeholder:text-stone-500', heading: 'font-extrabold tracking-tight' };
    case 'minimal':
      return { page: 'bg-white text-stone-900', card: 'rounded-none border-b border-stone-200 bg-white', muted: 'text-stone-500', input: 'bg-white border-stone-300', heading: 'font-light tracking-tight' };
    default:
      return { page: 'bg-stone-50 text-stone-900', card: 'rounded-2xl bg-white border border-stone-200 shadow-sm', muted: 'text-stone-500', input: 'bg-white border-stone-300', heading: 'font-extrabold tracking-tight' };
  }
}

export function InquiryForm({ slug, propertyId, accent, theme, preview }: { slug: string; propertyId?: string; accent: string; theme: LandingSettings['theme']; preview?: boolean }) {
  const t = useT();
  const tc = themeClasses(theme);
  const [f, setF] = useState({ name: '', phone: '', email: '', message: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (preview) return;
    setState('sending');
    setError('');
    try {
      await post(`/public/agents/${slug}/inquiries`, { ...f, propertyId: propertyId ?? null });
      setState('sent');
    } catch (err) {
      setError(err instanceof ApiError ? errorText(t, err) : t('Could not send your message'));
      setState('idle');
    }
  };
  if (state === 'sent') {
    return <div className={`rounded-2xl p-6 text-center ${tc.card}`}><div className="text-3xl">🙏</div><p className="mt-2 font-bold">{t('Thank you! Your message was sent.')}</p><p className={`text-sm ${tc.muted}`}>{t('The agent will get back to you soon.')}</p></div>;
  }
  const inp = `w-full rounded-xl border px-3.5 py-2.5 focus:outline-none focus:ring-2 ${tc.input}`;
  return (
    <form onSubmit={submit} className={`space-y-3 p-5 ${tc.card}`}>
      <input name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} className="hidden" aria-hidden="true" />
      <div className="grid gap-3 sm:grid-cols-2">
        <input required placeholder={t('Your name')} aria-label={t('Your name')} className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input placeholder={t('Phone')} aria-label={t('Phone')} inputMode="tel" className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </div>
      <input placeholder={t('Email (optional)')} aria-label={t('Email')} type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <textarea placeholder={t('I’m interested in…')} aria-label={t('Message')} rows={3} className={inp} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button disabled={state === 'sending'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold disabled:opacity-60" style={{ background: accent, color: onColor(accent) }}>
        <Send className="size-4" /> {state === 'sending' ? t('Sending…') : t('Send message')}
      </button>
    </form>
  );
}

export function ContactButtons({ agent, accent, className = '' }: { agent: SiteAgent; accent: string; className?: string }) {
  const t = useT();
  const btn = 'inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm';
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {agent.phone && <a href={`tel:${whatsappLikeTel(agent.phone)}`} className={btn} style={{ background: accent, color: onColor(accent) }}><Phone className="size-4" /> {agent.phone}</a>}
      {agent.lineId && <a href={lineUrl(agent.lineId)} target="_blank" rel="noreferrer" className={`${btn} bg-[#06C755] text-white`}><MessageCircle className="size-4" /> {t('LINE')}</a>}
      {agent.contactEmail && <a href={`mailto:${agent.contactEmail}`} className={`${btn} bg-white text-stone-800 ring-1 ring-stone-200`}><Mail className="size-4" /> {t('Email')}</a>}
    </div>
  );
}

function ListingCard({ p, href, theme, accent }: { p: Property; href: string; theme: LandingSettings['theme']; accent: string }) {
  const t = useT();
  const tc = themeClasses(theme);
  return (
    <Link to={href} className={`group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg ${tc.card}`}>
      <div className={`relative aspect-[4/3] overflow-hidden ${theme === 'modern' ? 'bg-stone-800' : 'bg-stone-100'}`}>
        {p.photos[0] ? <img src={p.photos[0]} alt={p.title} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid size-full place-items-center text-stone-300"><Building2 className="size-12" /></div>}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[p.status]}`}>{p.status === 'available' ? (p.listingType === 'rent' ? t('For rent') : p.listingType === 'sale' ? t('For sale') : t('For sale / rent')) : tEnum(p.status)}</span>
        {p.featured && <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-amber-950">{t('★ Featured')}</span>}
      </div>
      <div className="p-4">
        <div className="text-lg font-extrabold" style={{ color: theme === 'modern' ? undefined : accent }}><PriceLabel p={p} /></div>
        <h3 className="mt-0.5 line-clamp-1 font-semibold">{p.title}</h3>
        {(p.district || p.province) && <p className={`mt-0.5 flex items-center gap-1 text-sm ${tc.muted}`}><MapPin className="size-3.5" />{[p.district, p.province].filter(Boolean).join(', ')}</p>}
        <div className={`mt-3 flex gap-4 text-sm ${tc.muted}`}>
          {p.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble className="size-4" />{p.bedrooms}</span>}
          {p.bathrooms != null && <span className="inline-flex items-center gap-1"><Bath className="size-4" />{p.bathrooms}</span>}
          {p.areaSqm != null && <span className="inline-flex items-center gap-1"><Ruler className="size-4" />{p.areaSqm} {t('m²')}</span>}
          {p.landSqw != null && p.areaSqm == null && <span className="inline-flex items-center gap-1"><Ruler className="size-4" />{p.landSqw} ตร.ว.</span>}
        </div>
      </div>
    </Link>
  );
}

export function Branding({ show, theme }: { show: boolean; theme: LandingSettings['theme'] }) {
  const t = useT();
  if (!show) return null;
  return (
    <a href="/" className={`mt-10 flex items-center justify-center gap-2 py-6 text-sm ${theme === 'modern' ? 'text-stone-500' : 'text-stone-400'}`}>
      <LogoMark className="size-5" /> <b>{t('Made with Khondo')}</b>
    </a>
  );
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'sale', label: 'For sale' },
  { id: 'rent', label: 'For rent' },
];

export function AgentSite({ agent, properties, preview }: { agent: SiteAgent; properties: Property[]; preview?: boolean }) {
  const t = useT();
  const L = agent.landing;
  const tc = themeClasses(L.theme);
  const accent = L.accent;
  const [filter, setFilter] = useState('all');
  const [type, setType] = useState('all');
  const types = useMemo(() => [...new Set(properties.map((p) => p.type))], [properties]);
  const shown = properties.filter((p) => (filter === 'all' || p.listingType === filter || p.listingType === 'both') && (type === 'all' || p.type === type));
  const href = (p: Property) => (preview ? '#' : `/a/${agent.slug}/p/${p.id}`);
  const initial = agent.displayName.trim().charAt(0).toUpperCase();
  const style = { '--accent': accent } as CSSProperties;
  const heroDark = L.theme === 'modern' || !!L.coverUrl;
  const Wrap = ({ children }: { children: ReactNode }) => <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">{children}</div>;

  return (
    <div className={`${preview ? '' : 'min-h-dvh'} ${tc.page}`} style={style}>
      {L.announcement && (
        <div className="px-4 py-2 text-center text-sm font-semibold" style={{ background: accent, color: onColor(accent) }}>{L.announcement}</div>
      )}

      <div className="relative">
        {!preview && <div className="absolute right-3 top-3 z-30"><PrefsMenu tone={heroDark || L.theme === 'classic' ? 'glass' : 'light'} /></div>}
      <header className="relative overflow-hidden" style={L.coverUrl ? { background: `linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.75)), url("${L.coverUrl.replace(/["\\\n]/g, '')}") center/cover` } : L.theme === 'modern' ? { background: `radial-gradient(1200px 400px at 20% -10%, ${accent}66, transparent), #0c0a09` } : L.theme === 'minimal' ? undefined : { background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
        <Wrap>
          <div className={`flex flex-col items-start gap-5 py-10 sm:flex-row sm:items-center sm:py-16 ${heroDark || L.theme === 'classic' ? 'text-white' : 'text-stone-900'}`}>
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.displayName} className="size-24 shrink-0 rounded-full object-cover ring-4 ring-white/70 sm:size-32" />
            ) : (
              <div className="grid size-24 shrink-0 place-items-center rounded-full bg-white/90 text-4xl font-extrabold ring-4 ring-white/70 sm:size-32" style={{ color: accent }}>{initial}</div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold opacity-80">{agent.headline}</p>
              <h1 className={`mt-1 text-3xl sm:text-5xl ${tc.heading}`}>{L.heroTitle || agent.displayName}</h1>
              {L.heroSubtitle && <p className="mt-2 max-w-xl text-base opacity-90 sm:text-lg">{L.heroSubtitle}</p>}
              <ContactButtons agent={agent} accent={L.theme === 'classic' || heroDark ? '#ffffff' : accent} className="mt-5 [&_a:first-child]:!text-stone-900" />
            </div>
          </div>
        </Wrap>
      </header>
      </div>

      <Wrap>
        <section className="py-8 sm:py-12">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className={`text-2xl sm:text-3xl ${tc.heading}`}>{t('Properties')} <span className={`text-lg font-medium ${tc.muted}`}>({shown.length})</span></h2>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((x) => (
                <button key={x.id} onClick={() => setFilter(x.id)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${filter === x.id ? 'border-transparent' : theme(L.theme)}`} style={filter === x.id ? { background: accent, color: onColor(accent) } : undefined}>{t(x.label)}</button>
              ))}
              {types.length > 1 && (
                <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('Property type')} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${theme(L.theme)}`}>
                  <option value="all">{t('All types')}</option>
                  {types.map((x) => <option key={x} value={x}>{tEnum(x)}</option>)}
                </select>
              )}
            </div>
          </div>
          {shown.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((p) => <ListingCard key={p.id} p={p} href={href(p)} theme={L.theme} accent={accent} />)}
            </div>
          ) : (
            <p className={`py-16 text-center ${tc.muted}`}>{t('No properties to show right now. Check back soon!')}</p>
          )}
          <RatesNote className="mt-4" />
        </section>

        {L.showAbout && agent.bio && (
          <section className="grid gap-6 pb-10 md:grid-cols-3">
            <h2 className={`text-2xl sm:text-3xl ${tc.heading}`}>{t('About')} {agent.displayName.split(' ')[0]}</h2>
            <p className={`whitespace-pre-line leading-relaxed md:col-span-2 ${tc.muted}`}>{agent.bio}</p>
          </section>
        )}

        {L.showContact && (
          <section className="grid gap-6 pb-6 md:grid-cols-3">
            <div>
              <h2 className={`text-2xl sm:text-3xl ${tc.heading}`}>{t('Get in touch')}</h2>
              <p className={`mt-2 ${tc.muted}`}>{t('Tell me what you’re looking for in Khon Kaen and I’ll find the right place.')}</p>
              <div className="mt-4 flex gap-3">
                {L.facebook && <a href={L.facebook} target="_blank" rel="noreferrer noopener" aria-label={t('Facebook')} className={tc.muted}><Facebook className="size-6" /></a>}
                {L.instagram && <a href={L.instagram} target="_blank" rel="noreferrer noopener" aria-label={t('Instagram')} className={tc.muted}><Instagram className="size-6" /></a>}
                {L.website && <a href={L.website} target="_blank" rel="noreferrer noopener" aria-label={t('Website')} className={tc.muted}><Globe className="size-6" /></a>}
              </div>
            </div>
            <div className="md:col-span-2"><InquiryForm slug={agent.slug} accent={accent} theme={L.theme} preview={preview} /></div>
          </section>
        )}
        <Branding show={agent.showBranding} theme={L.theme} />
      </Wrap>
    </div>
  );
}

function theme(th: LandingSettings['theme']) {
  return th === 'modern' ? 'border-stone-700 bg-stone-900 text-stone-300' : 'border-stone-300 bg-white text-stone-600';
}
