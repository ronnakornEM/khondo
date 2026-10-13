import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Copy, ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { CONTACT_STAGES, type DashboardResponse } from '@shared/types';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, money, titleCase } from '@/lib/format';
import { Card, EmptyState, ErrorNote, LinkButton, PageHeader, PageLoader, PremiumBadge, Stat, UpgradePrompt, btnClass } from '@/components/ui';

export function Dashboard() {
  const { me, limits, isPremium } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashboardResponse>('/dashboard') });
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/a/${me!.agent.slug}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data!;
  const total = Object.values(d.properties).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title={`Hi, ${me!.agent.displayName.split(' ')[0]} 👋`} subtitle="Here’s your portfolio at a glance." actions={<LinkButton to="/app/properties/new"><Plus className="size-4" /> Add property</LinkButton>} />

      <Card className="mb-5 flex flex-col gap-3 bg-gradient-to-br from-brand-700 to-brand-900 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-200">Your landing page</div>
          <div className="truncate text-lg font-bold">{url.replace(/^https?:\/\//, '')}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold hover:bg-white/25">
            <Copy className="size-4" /> {copied ? 'Copied!' : 'Copy link'}
          </button>
          <a href={`/a/${me!.agent.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-brand-800">
            <ExternalLink className="size-4" /> Open
          </a>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Listings" value={`${total}/${limits.maxProperties}`} to="/app/properties" />
        <Stat label="Available" value={d.properties.available} tone="text-emerald-700" to="/app/properties" />
        <Stat label="Sold / rented" value={d.properties.sold + d.properties.rented} />
        <Stat label="New inquiries" value={d.newInquiries} tone={d.newInquiries ? 'text-red-600' : undefined} to="/app/inquiries" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Upcoming</h2>
            <Link to="/app/calendar" className="text-sm font-semibold text-brand-700">Calendar</Link>
          </div>
          {d.upcomingEvents.length ? (
            <ul className="divide-y divide-stone-100">
              {d.upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-800">
                    <span className="text-[10px] font-bold uppercase">{dateLabel(e.startAt, 'MMM')}</span>
                    <span className="-mt-0.5 text-sm font-extrabold leading-none">{dateLabel(e.startAt, 'd')}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{e.title}</div>
                    <div className="truncate text-xs text-stone-500">{e.allDay ? 'All day' : dateLabel(e.startAt, 'HH:mm')} · {titleCase(e.kind)}{e.propertyTitle ? ` · ${e.propertyTitle}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarDays className="size-5" />} title="Nothing scheduled" text="Add viewings and meetings to your calendar." action={<Link to="/app/calendar" className={btnClass('secondary', 'sm')}>Open calendar</Link>} />
          )}
        </Card>

        {isPremium && d.outstanding ? (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Bills</h2>
              <Link to="/app/bills" className="text-sm font-semibold text-brand-700">All bills</Link>
            </div>
            <div className="text-3xl font-extrabold">{money(d.outstanding.total)}</div>
            <div className="text-sm text-stone-500">outstanding across {d.outstanding.count} sent bill{d.outstanding.count === 1 ? '' : 's'}</div>
            {d.outstanding.overdue > 0 && <div className="mt-2 text-sm font-semibold text-red-600">{d.outstanding.overdue} overdue</div>}
          </Card>
        ) : (
          <UpgradePrompt feature="bills" compact text="Send professional bills for rent, deposits and commissions and track what’s been paid." />
        )}

        {isPremium && d.contactsByStage ? (
          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold">Pipeline <PremiumBadge /></h2>
              <Link to="/app/contacts" className="text-sm font-semibold text-brand-700">Contacts</Link>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {CONTACT_STAGES.map((st) => (
                <div key={st} className="rounded-xl bg-stone-50 p-3 text-center">
                  <div className="text-xl font-extrabold">{d.contactsByStage![st]}</div>
                  <div className="text-xs font-medium text-stone-500">{titleCase(st)}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
