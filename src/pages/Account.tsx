import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Inbox, Mail, MessageCircle, Phone, User } from 'lucide-react';
import type { MyInquiry } from '@shared/types';
import { api, get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, lineUrl, whatsappLikeTel } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { SiteHeader } from '@/components/SiteHeader';
import { SavedList } from './Saved';
import { Button, Card, EmptyState, ErrorNote, LinkButton, PageLoader, TextInput, cx } from '@/components/ui';

type Tab = 'saved' | 'inquiries' | 'profile';

/** Customer area (buyers / renters). Browsing never requires it — an account just keeps things in sync. */
export function AccountPage() {
  const t = useT();
  const { token, role, customer, loading, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (['saved', 'inquiries', 'profile'].includes(params.get('tab') ?? '') ? params.get('tab') : 'saved') as Tab;

  if (!token) return <Navigate to="/login?role=customer" replace state={{ from: '/account' }} />;
  if (loading) return <PageLoader />;
  if (role === 'agent') return <Navigate to="/app" replace />;

  const tabs: { id: Tab; label: string; icon: typeof Heart }[] = [
    { id: 'saved', label: t('Saved'), icon: Heart },
    { id: 'inquiries', label: t('My inquiries'), icon: Inbox },
    { id: 'profile', label: t('Profile'), icon: User },
  ];
  return (
    <div className="min-h-dvh bg-stone-50">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{t('Hi, {name} 👋', { name: customer?.user.name.split(' ')[0] ?? '' })}</h1>
            <p className="text-stone-500">{customer?.user.email}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={signOut}>{t('Sign out')}</Button>
        </div>
        <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-stone-200/70 p-1">
          {tabs.map((x) => (
            <button key={x.id} onClick={() => setParams({ tab: x.id }, { replace: true })} className={cx('flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold', tab === x.id ? 'bg-white shadow-sm' : 'text-stone-600')}>
              <x.icon className="size-4" />{x.label}
            </button>
          ))}
        </div>
        {tab === 'saved' && <SavedList />}
        {tab === 'inquiries' && <MyInquiries />}
        {tab === 'profile' && <Profile />}
      </main>
    </div>
  );
}

function MyInquiries() {
  const t = useT();
  const q = useQuery({ queryKey: ['my-inquiries'], queryFn: () => get<MyInquiry[]>('/my/inquiries') });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data?.length) return <EmptyState icon={<Inbox className="size-6" />} title={t('No inquiries yet')} text={t('When you message an agent about a property, it will be listed here.')} action={<LinkButton to="/browse">{t('Browse properties')}</LinkButton>} />;
  return (
    <div className="space-y-3">
      {q.data.map((i) => (
        <Card key={i.id} className="flex gap-4">
          {i.propertyPhoto && <img src={i.propertyPhoto} alt="" className="hidden size-20 shrink-0 rounded-xl object-cover sm:block" />}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-stone-500">{dateLabel(i.createdAt, 'd MMM yyyy, HH:mm')}</div>
            <div className="font-bold">
              {i.propertyId ? <Link to={`/a/${i.agentSlug}/p/${i.propertyId}`} className="hover:underline">{i.propertyTitle}</Link> : t('General inquiry')}
            </div>
            <Link to={`/a/${i.agentSlug}`} className="text-sm font-semibold text-brand-700 hover:underline">{i.agentName}</Link>
            {i.message && <p className="mt-1 whitespace-pre-line text-sm text-stone-600">{i.message}</p>}
            <div className="mt-2 flex gap-2">
              {i.agentPhone && <a href={`tel:${whatsappLikeTel(i.agentPhone)}`} aria-label={t('Call')} className="rounded-full bg-brand-50 p-2 text-brand-800"><Phone className="size-4" /></a>}
              {i.agentLineId && <a href={lineUrl(i.agentLineId)} target="_blank" rel="noreferrer" aria-label="LINE" className="rounded-full bg-emerald-50 p-2 text-emerald-700"><MessageCircle className="size-4" /></a>}
              {i.agentEmail && <a href={`mailto:${i.agentEmail}`} aria-label={t('Email')} className="rounded-full bg-brand-50 p-2 text-brand-800"><Mail className="size-4" /></a>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Profile() {
  const t = useT();
  const qc = useQueryClient();
  const { customer } = useAuth();
  const [name, setName] = useState(customer?.user.name ?? '');
  const [phone, setPhone] = useState(customer?.user.phone ?? '');
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!saved) return; const id = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(id); }, [saved]);
  const save = useMutation({
    mutationFn: () => api('/account', { method: 'PATCH', json: { name, phone } }),
    onSuccess: () => { setSaved(true); qc.invalidateQueries({ queryKey: ['me'] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Card className="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <TextInput label={t('Your name')} required value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput label={t('Phone')} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint={t('Used to prefill your inquiries. Agents only see it when you contact them.')} />
        <TextInput label={t('Email')} value={customer?.user.email ?? ''} disabled readOnly />
        <ErrorNote error={save.error} />
        <Button type="submit" loading={save.isPending}>{saved ? t('Saved ✓') : t('Save changes')}</Button>
      </form>
    </Card>
  );
}
