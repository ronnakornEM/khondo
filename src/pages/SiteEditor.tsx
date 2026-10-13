import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Crown, ExternalLink, Eye, Pencil } from 'lucide-react';
import { LANDING_THEMES, type Agent, type LandingSettings, type Property } from '@shared/types';
import { ApiError, get, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { titleCase } from '@/lib/format';
import { AgentSite } from '@/components/AgentSite';
import { uploadImage } from '@/components/ImageUploader';
import { Button, Card, ErrorNote, PageHeader, PageLoader, PremiumBadge, TextArea, TextInput, Toggle, btnClass, cx } from '@/components/ui';

const SWATCHES = ['#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#c2410c', '#a16207', '#15803d', '#0f172a'];
const THEME_INFO: Record<string, string> = { classic: 'Bright and friendly', modern: 'Dark, bold, premium feel', minimal: 'Clean, editorial' };

type Draft = Pick<Agent, 'displayName' | 'headline' | 'bio' | 'phone' | 'lineId' | 'contactEmail' | 'avatarUrl' | 'slug' | 'landing'>;
const pick = (a: Agent): Draft => ({ displayName: a.displayName, headline: a.headline, bio: a.bio, phone: a.phone, lineId: a.lineId, contactEmail: a.contactEmail, avatarUrl: a.avatarUrl, slug: a.slug, landing: a.landing });

export function SiteEditorPage() {
  const { me, limits, isPremium, refresh } = useAuth();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => pick(me!.agent));
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const props = useQuery({ queryKey: ['properties', '', ''], queryFn: () => get<Property[]>('/properties') });
  const listings = (props.data ?? []).filter((p) => p.published).slice(0, limits.maxProperties);

  const setL = <K extends keyof LandingSettings>(k: K, v: LandingSettings[K]) => setD((x) => ({ ...x, landing: { ...x.landing, [k]: v } }));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const save = useMutation({
    mutationFn: () => patch<{ agent: Agent }>('/me/profile', d),
    onSuccess: (r) => {
      setD(pick(r.agent));
      setSaved(true);
      refresh();
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });

  const onAvatar = async (f?: File) => {
    if (!f) return;
    setAvatarBusy(true);
    setAvatarErr('');
    try {
      set('avatarUrl', await uploadImage(f));
    } catch (e) {
      setAvatarErr(e instanceof ApiError && e.code === 'uploads_disabled' ? 'Uploads are not enabled on this server — paste an image link below.' : e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  if (props.isLoading) return <PageLoader />;
  const previewAgent = { ...d, id: me!.agent.id, landing: d.landing, showBranding: !limits.removeBranding };
  const pageUrl = `${window.location.origin}/a/${d.slug}`;
  const premiumLocked = (needs: boolean) => needs && !isPremium;

  return (
    <>
      <PageHeader
        title="My landing page"
        subtitle={pageUrl.replace(/^https?:\/\//, '')}
        actions={
          <>
            <a href={`/a/${me!.agent.slug}`} target="_blank" rel="noreferrer" className={btnClass('secondary')}><ExternalLink className="size-4" /> View live</a>
            <Button loading={save.isPending} onClick={() => save.mutate()}>{saved ? <><Check className="size-4" /> Saved</> : 'Save changes'}</Button>
          </>
        }
      />
      <div className="mb-4 flex rounded-xl bg-stone-200/70 p-1 lg:hidden">
        {(['edit', 'preview'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold', tab === t ? 'bg-white shadow-sm' : 'text-stone-600')}>
            {t === 'edit' ? <Pencil className="size-4" /> : <Eye className="size-4" />}{titleCase(t)}
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div className={cx('space-y-5', tab === 'preview' && 'hidden lg:block')}>
          <Card className="space-y-4">
            <h2 className="font-bold">Profile</h2>
            <div className="flex items-center gap-4">
              {d.avatarUrl ? <img src={d.avatarUrl} alt="" className="size-20 rounded-full object-cover" /> : <div className="grid size-20 place-items-center rounded-full bg-brand-100 text-2xl font-extrabold text-brand-800">{d.displayName.charAt(0).toUpperCase()}</div>}
              <div className="flex-1 space-y-2">
                <Button type="button" size="sm" variant="secondary" loading={avatarBusy} onClick={() => fileRef.current?.click()}><Camera className="size-4" /> Upload photo</Button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
                {avatarErr && <p className="text-xs text-red-600">{avatarErr}</p>}
              </div>
            </div>
            <TextInput label="Photo link" placeholder="https://…" value={d.avatarUrl} onChange={(e) => set('avatarUrl', e.target.value)} />
            <TextInput label="Name / agency" value={d.displayName} onChange={(e) => set('displayName', e.target.value)} />
            <TextInput label="Headline" placeholder="Condo specialist in Khon Kaen" value={d.headline} onChange={(e) => set('headline', e.target.value)} />
            <TextArea label="About you" rows={5} value={d.bio} onChange={(e) => set('bio', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Phone" inputMode="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
              <TextInput label="LINE ID" placeholder="@khondo" value={d.lineId} onChange={(e) => set('lineId', e.target.value)} />
            </div>
            <TextInput label="Public email" type="email" value={d.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            <TextInput label="Page address" value={d.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} hint={`${window.location.host}/a/${d.slug || 'your-name'}`} />
          </Card>

          <Card className="space-y-4">
            <h2 className="font-bold">Look & feel</h2>
            <div className="grid grid-cols-3 gap-2">
              {LANDING_THEMES.map((t) => {
                const locked = premiumLocked(t !== 'classic');
                return (
                  <button key={t} type="button" disabled={locked} onClick={() => setL('theme', t)} className={cx('relative rounded-xl border-2 p-2.5 text-left transition disabled:opacity-60', d.landing.theme === t ? 'border-brand-700 bg-brand-50' : 'border-stone-200 bg-white')}>
                    <div className={cx('mb-2 h-10 rounded-lg', t === 'classic' && 'bg-gradient-to-br from-brand-600 to-brand-500', t === 'modern' && 'bg-stone-900', t === 'minimal' && 'border border-stone-300 bg-white')} />
                    <div className="text-sm font-bold">{titleCase(t)}</div>
                    <div className="text-[11px] leading-tight text-stone-500">{THEME_INFO[t]}</div>
                    {locked && <Crown className="absolute right-2 top-2 size-4 text-amber-500" />}
                  </button>
                );
              })}
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium text-stone-700">Accent colour</div>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" onClick={() => setL('accent', c)} aria-label={c} className={cx('size-8 rounded-full ring-offset-2', d.landing.accent === c && 'ring-2 ring-stone-900')} style={{ background: c }} />
                ))}
                <input type="color" value={d.landing.accent} onChange={(e) => setL('accent', e.target.value)} aria-label="Custom colour" className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0" />
              </div>
            </div>
            <TextInput label="Hero title" placeholder={d.displayName} value={d.landing.heroTitle} onChange={(e) => setL('heroTitle', e.target.value)} />
            <TextInput label="Hero subtitle" placeholder="Find your home in Khon Kaen" value={d.landing.heroSubtitle} onChange={(e) => setL('heroSubtitle', e.target.value)} />
            <TextInput label="Cover image link" placeholder="https://…" value={d.landing.coverUrl} onChange={(e) => setL('coverUrl', e.target.value)} />
            <div>
              <TextInput label="Announcement banner" placeholder="Open house this Saturday 10:00!" disabled={!isPremium} value={d.landing.announcement} onChange={(e) => setL('announcement', e.target.value)} />
              {!isPremium && <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700"><PremiumBadge /> <Link to="/app/billing" className="underline">Upgrade</Link> to show a banner and remove Khondo branding.</p>}
            </div>
          </Card>

          <Card className="space-y-1">
            <h2 className="mb-1 font-bold">Sections</h2>
            <Toggle label="About me" checked={d.landing.showAbout} onChange={(v) => setL('showAbout', v)} />
            <Toggle label="Contact form" checked={d.landing.showContact} onChange={(v) => setL('showContact', v)} />
            <Toggle label="Show sold & rented listings" hint="A track record builds trust." checked={d.landing.showSold} onChange={(v) => setL('showSold', v)} />
          </Card>

          <Card className="space-y-3">
            <h2 className="font-bold">Social links</h2>
            <TextInput label="Facebook" placeholder="https://facebook.com/…" value={d.landing.facebook} onChange={(e) => setL('facebook', e.target.value)} />
            <TextInput label="Instagram" placeholder="https://instagram.com/…" value={d.landing.instagram} onChange={(e) => setL('instagram', e.target.value)} />
            <TextInput label="Website" placeholder="https://…" value={d.landing.website} onChange={(e) => setL('website', e.target.value)} />
          </Card>
          <ErrorNote error={save.error} />
          <Button className="w-full lg:hidden" loading={save.isPending} onClick={() => save.mutate()}>{saved ? 'Saved ✓' : 'Save changes'}</Button>
        </div>

        <div className={cx('lg:sticky lg:top-6 lg:self-start', tab === 'edit' && 'hidden lg:block')}>
          <div className="overflow-hidden rounded-3xl border-4 border-stone-800 bg-white shadow-xl">
            <div className="flex items-center gap-1.5 bg-stone-800 px-3 py-2"><span className="size-2.5 rounded-full bg-red-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-emerald-400" /><span className="ml-2 truncate text-xs text-stone-400">{pageUrl.replace(/^https?:\/\//, '')}</span></div>
            <div className="max-h-[78dvh] overflow-y-auto"><AgentSite agent={previewAgent} properties={listings} preview /></div>
          </div>
          <p className="mt-2 text-center text-xs text-stone-500">Live preview — shows your published properties.</p>
        </div>
      </div>
    </>
  );
}
