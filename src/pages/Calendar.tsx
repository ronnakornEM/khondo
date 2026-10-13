import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, endOfDay, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarSync, ChevronLeft, ChevronRight, Crown, Plus, Repeat } from 'lucide-react';
import { EVENT_KINDS, RECURRENCES, type Bill, type CalendarEvent, type Contact, type EventKind, type Property } from '@shared/types';
import { expandEvents, type Occurrence } from '@shared/recurrence';
import { del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmt, fromLocalInput, money, tEnum, toLocalInput } from '@/lib/format';
import { Button, ErrorNote, Modal, PageHeader, PageLoader, PremiumBadge, Select, TextArea, TextInput, Toggle, cx } from '@/components/ui';
import { useT } from '@/lib/i18n';

type View = 'month' | 'week' | 'day';
const KIND_STYLE: Record<EventKind, string> = {
  viewing: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  meeting: 'bg-sky-100 text-sky-900 border-sky-300',
  call: 'bg-violet-100 text-violet-900 border-violet-300',
  signing: 'bg-amber-100 text-amber-900 border-amber-300',
  task: 'bg-stone-100 text-stone-800 border-stone-300',
  other: 'bg-rose-100 text-rose-900 border-rose-300',
};
const DOT: Record<EventKind, string> = { viewing: 'bg-emerald-500', meeting: 'bg-sky-500', call: 'bg-violet-500', signing: 'bg-amber-500', task: 'bg-stone-500', other: 'bg-rose-500' };
const HOUR_PX = 52;
const WEEK = { weekStartsOn: 0 as const };

function rangeFor(view: View, cursor: Date) {
  if (view === 'month') return { from: startOfWeek(startOfMonth(cursor), WEEK), to: endOfWeek(endOfMonth(cursor), WEEK) };
  if (view === 'week') return { from: startOfWeek(cursor, WEEK), to: endOfWeek(cursor, WEEK) };
  return { from: startOfDay(cursor), to: endOfDay(cursor) };
}

export function CalendarPage() {
  const t = useT();
  const { limits, isPremium, me } = useAuth();
  const nav = useNavigate();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [editing, setEditing] = useState<{ event?: CalendarEvent; start?: Date } | null>(null);
  const [showFeed, setShowFeed] = useState(false);

  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const evQ = useQuery({
    queryKey: ['events', from.toISOString(), to.toISOString()],
    queryFn: () => get<CalendarEvent[]>(`/events?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`),
    placeholderData: keepPreviousData,
  });
  const billsQ = useQuery({ queryKey: ['bills', ''], queryFn: () => get<Bill[]>('/bills'), enabled: limits.advancedCalendar && limits.bills });

  const occurrences = useMemo(() => expandEvents(evQ.data ?? [], from, to), [evQ.data, from, to]);
  const dueBills = useMemo(() => (billsQ.data ?? []).filter((b) => b.dueDate && b.status === 'sent'), [billsQ.data]);

  const move = (dir: -1 | 1) => setCursor((c) => (view === 'month' ? addMonths(c, dir) : view === 'week' ? addWeeks(c, dir) : addDays(c, dir)));
  const title = view === 'month' ? fmt(cursor, 'MMMM yyyy') : view === 'week' ? `${fmt(from, 'd MMM')} – ${fmt(to, 'd MMM yyyy')}` : fmt(cursor, 'EEEE, d MMMM yyyy');
  const forDay = (d: Date) => occurrences.filter((o) => isSameDay(new Date(o.occurrenceStart), d) || (new Date(o.occurrenceStart) < startOfDay(d) && new Date(o.occurrenceEnd) > startOfDay(d)));
  const billsOn = (d: Date) => dueBills.filter((b) => b.dueDate === format(d, 'yyyy-MM-dd'));
  const openNew = (d: Date) => { const s = new Date(d); if (s.getHours() === 0 && s.getMinutes() === 0) s.setHours(10); setEditing({ start: s }); };
  const openEvent = (o: Occurrence) => setEditing({ event: evQ.data?.find((e) => e.id === o.id) });
  const lockedView = (v: View) => v !== 'month' && !limits.advancedCalendar;

  return (
    <>
      <PageHeader
        title={t('Calendar')}
        subtitle={isPremium ? undefined : t('Basic calendar — upgrade for week/day views, recurring events, reminders and sync.')}
        actions={
          <>
            {limits.advancedCalendar && me?.calendarFeedUrl && <Button variant="secondary" onClick={() => setShowFeed(true)}><CalendarSync className="size-4" /> {t('Sync')}</Button>}
            <Button onClick={() => openNew(selected)}><Plus className="size-4" /> {t('New event')}</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => move(-1)} aria-label={t('Previous')}><ChevronLeft className="size-4" /></Button>
          <Button variant="secondary" size="sm" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>{t('Today')}</Button>
          <Button variant="secondary" size="sm" onClick={() => move(1)} aria-label={t('Next')}><ChevronRight className="size-4" /></Button>
          <h2 className="ml-2 text-lg font-extrabold">{title}</h2>
        </div>
        <div className="flex rounded-xl bg-stone-200/70 p-1">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button key={v} onClick={() => (lockedView(v) ? nav('/app/billing') : setView(v))} className={cx('flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold', view === v ? 'bg-white shadow-sm' : 'text-stone-600')}>
              {tEnum(v)} {lockedView(v) && <Crown className="size-3 text-amber-500" />}
            </button>
          ))}
        </div>
      </div>

      {evQ.isLoading ? <PageLoader /> : evQ.error ? <ErrorNote error={evQ.error} /> : view === 'month' ? (
        <>
          <MonthGrid cursor={cursor} from={from} to={to} selected={selected} forDay={forDay} billsOn={billsOn} onSelect={(d) => { setSelected(d); setCursor(d); }} onCreate={openNew} />
          <DayAgenda day={selected} items={forDay(selected)} bills={billsOn(selected)} onOpen={openEvent} onNew={() => openNew(selected)} />
        </>
      ) : (
        <TimeGrid days={eachDayOfInterval({ start: from, end: to })} forDay={forDay} billsOn={billsOn} onOpen={openEvent} onCreate={openNew} />
      )}

      {editing && <EventModal event={editing.event} start={editing.start} onClose={() => setEditing(null)} />}
      {showFeed && me?.calendarFeedUrl && <FeedModal url={me.calendarFeedUrl} onClose={() => setShowFeed(false)} />}
    </>
  );
}

function MonthGrid({ cursor, from, to, selected, forDay, billsOn, onSelect, onCreate }: { cursor: Date; from: Date; to: Date; selected: Date; forDay: (d: Date) => Occurrence[]; billsOn: (d: Date) => Bill[]; onSelect: (d: Date) => void; onCreate: (d: Date) => void }) {
  const t = useT();
  const days = eachDayOfInterval({ start: from, end: to });
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-xs font-bold uppercase text-stone-500">
        {days.slice(0, 7).map((d) => <div key={d.toISOString()} className="py-2">{fmt(d, 'EEE')}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = forDay(d);
          const bills = billsOn(d);
          const isSel = isSameDay(d, selected);
          return (
            <div key={d.toISOString()} onClick={() => onSelect(d)} onDoubleClick={() => onCreate(d)} className={cx('min-h-16 cursor-pointer border-b border-r border-stone-100 p-1 sm:min-h-24 sm:p-1.5', !isSameMonth(d, cursor) && 'bg-stone-50/70 text-stone-400', isSel && 'bg-brand-50')}>
              <div className={cx('mx-auto flex size-6 items-center justify-center rounded-full text-xs font-bold sm:mx-0 sm:size-7 sm:text-sm', isSameDay(d, new Date()) && 'bg-brand-700 text-white', isSel && !isSameDay(d, new Date()) && 'ring-2 ring-brand-600')}>{format(d, 'd')}</div>
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {items.slice(0, 3).map((o) => <div key={o.id + o.occurrenceStart} className={cx('truncate rounded border px-1 py-0.5 text-[11px] font-semibold', KIND_STYLE[o.kind])}>{!o.allDay && format(new Date(o.occurrenceStart), 'HH:mm ')}{o.title}</div>)}
                {items.length > 3 && <div className="text-[11px] font-semibold text-stone-500">{t('+{n} more', { n: items.length - 3 })}</div>}
                {bills.slice(0, 1).map((b) => <div key={b.id} className="truncate rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[11px] font-semibold text-red-700">฿ {t('{number} due', { number: b.number })}</div>)}
              </div>
              <div className="mt-1 flex justify-center gap-0.5 sm:hidden">
                {items.slice(0, 3).map((o) => <span key={o.id + o.occurrenceStart} className={cx('size-1.5 rounded-full', DOT[o.kind])} />)}
                {bills.length > 0 && <span className="size-1.5 rounded-full bg-red-500" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayAgenda({ day, items, bills, onOpen, onNew }: { day: Date; items: Occurrence[]; bills: Bill[]; onOpen: (o: Occurrence) => void; onNew: () => void }) {
  const t = useT();
  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between"><h3 className="font-bold">{fmt(day, 'EEEE, d MMMM')}</h3><button onClick={onNew} className="text-sm font-semibold text-brand-700">{t('+ Add')}</button></div>
      {!items.length && !bills.length && <p className="py-4 text-center text-sm text-stone-500">{t('Nothing scheduled.')}</p>}
      <ul className="space-y-2">
        {items.map((o) => (
          <li key={o.id + o.occurrenceStart}>
            <button onClick={() => onOpen(o)} className={cx('w-full rounded-xl border px-3 py-2 text-left', KIND_STYLE[o.kind])}>
              <div className="flex items-center gap-1.5 font-bold">{o.isRecurrence || o.recurrence !== 'none' ? <Repeat className="size-3.5" /> : null}{o.title}</div>
              <div className="text-xs opacity-80">{o.allDay ? t('All day') : `${format(new Date(o.occurrenceStart), 'HH:mm')} – ${format(new Date(o.occurrenceEnd), 'HH:mm')}`} · {tEnum(o.kind)}{o.location ? ` · ${o.location}` : ''}{o.contactName ? ` · ${o.contactName}` : ''}{o.propertyTitle ? ` · ${o.propertyTitle}` : ''}</div>
            </button>
          </li>
        ))}
        {bills.map((b) => <li key={b.id}><Link to={`/app/bills/${b.id}`} className="block rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{t('Bill {number} due · {amount}', { number: b.number, amount: money(b.total) })}{b.contactName ? ` · ${b.contactName}` : ''}</Link></li>)}
      </ul>
    </div>
  );
}

function layoutDay(items: Occurrence[], day: Date) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 86400_000;
  const boxes = items.filter((o) => !o.allDay).map((o) => {
    const s = Math.max(new Date(o.occurrenceStart).getTime(), dayStart);
    const e = Math.min(Math.max(new Date(o.occurrenceEnd).getTime(), s + 30 * 60_000), dayEnd);
    return { o, s, e, col: 0, cols: 1 };
  }).sort((a, b) => a.s - b.s);
  // greedy column assignment within clusters of overlapping events
  let cluster: typeof boxes = [];
  let clusterEnd = 0;
  const flush = () => { const n = Math.max(1, ...cluster.map((b) => b.col + 1)); cluster.forEach((b) => (b.cols = n)); cluster = []; };
  for (const b of boxes) {
    if (cluster.length && b.s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.e > b.s).map((c) => c.col));
    while (used.has(b.col)) b.col++;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.e);
  }
  flush();
  return boxes.map((b) => ({ ...b, top: ((b.s - dayStart) / 3600_000) * HOUR_PX, height: Math.max(((b.e - b.s) / 3600_000) * HOUR_PX, 22) }));
}

function TimeGrid({ days, forDay, billsOn, onOpen, onCreate }: { days: Date[]; forDay: (d: Date) => Occurrence[]; billsOn: (d: Date) => Bill[]; onOpen: (o: Occurrence) => void; onCreate: (d: Date) => void }) {
  const t = useT();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const now = new Date();
  const scroller = useRef<HTMLDivElement>(null);
  // Start the day at 07:00 instead of midnight
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX; }, []);
  return (
    <div ref={scroller} className="max-h-[72dvh] overflow-auto rounded-2xl border border-stone-200 bg-white">
      <div style={{ minWidth: days.length === 1 ? 0 : 720 }}>
        <div className="sticky top-0 z-10 grid border-b border-stone-200 bg-stone-50" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0,1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="border-l border-stone-200 px-1 py-2 text-center">
              <div className="text-xs font-bold uppercase text-stone-500">{fmt(d, 'EEE')}</div>
              <div className={cx('mx-auto flex size-8 items-center justify-center rounded-full text-lg font-extrabold', isSameDay(d, now) && 'bg-brand-700 text-white')}>{format(d, 'd')}</div>
              {forDay(d).filter((o) => o.allDay).map((o) => <button key={o.id + o.occurrenceStart} onClick={() => onOpen(o)} className={cx('mt-1 block w-full truncate rounded border px-1 text-left text-[11px] font-semibold', KIND_STYLE[o.kind])}>{o.title}</button>)}
              {billsOn(d).map((b) => <Link key={b.id} to={`/app/bills/${b.id}`} className="mt-1 block truncate rounded border border-red-200 bg-red-50 px-1 text-left text-[11px] font-semibold text-red-700">฿ {t('{number} due', { number: b.number })}</Link>)}
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0,1fr))` }}>
          <div>{hours.map((h) => <div key={h} style={{ height: HOUR_PX }} className="pr-1.5 text-right text-[11px] font-medium text-stone-400"><span className="relative -top-2">{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</span></div>)}</div>
          {days.map((d) => (
            <div key={d.toISOString()} className="relative border-l border-stone-200">
              {hours.map((h) => <div key={h} style={{ height: HOUR_PX }} className="border-t border-stone-100 hover:bg-brand-50/50" onClick={() => { const s = new Date(d); s.setHours(h, 0, 0, 0); onCreate(s); }} />)}
              {isSameDay(d, now) && <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }} />}
              {layoutDay(forDay(d), d).map((b) => (
                <button key={b.o.id + b.o.occurrenceStart} onClick={(e) => { e.stopPropagation(); onOpen(b.o); }} className={cx('absolute overflow-hidden rounded-lg border px-1.5 py-0.5 text-left text-xs shadow-sm', KIND_STYLE[b.o.kind])} style={{ top: b.top, height: b.height - 2, left: `${(b.col / b.cols) * 100}%`, width: `calc(${100 / b.cols}% - 3px)` }}>
                  <div className="truncate font-bold">{b.o.title}</div>
                  <div className="truncate opacity-80">{format(new Date(b.o.occurrenceStart), 'HH:mm')}{b.o.location ? ` · ${b.o.location}` : ''}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const REMINDERS = [
  { v: '', l: 'No reminder' }, { v: '0', l: 'At time of event' }, { v: '15', l: '15 minutes before' }, { v: '30', l: '30 minutes before' }, { v: '60', l: '1 hour before' }, { v: '1440', l: '1 day before' },
];

function EventModal({ event, start, onClose }: { event?: CalendarEvent; start?: Date; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { limits } = useAuth();
  const adv = limits.advancedCalendar;
  const init = useMemo(() => {
    if (event) return event;
    const s = start ?? new Date();
    return { title: '', description: '', kind: 'viewing' as EventKind, startAt: s.toISOString(), endAt: new Date(s.getTime() + 3600_000).toISOString(), allDay: false, location: '', contactId: null, propertyId: null, recurrence: 'none' as const, recurrenceUntil: null, reminderMinutes: null };
  }, [event, start]);
  const [d, setD] = useState({
    title: init.title, description: init.description, kind: init.kind as string, allDay: init.allDay, location: init.location,
    startAt: toLocalInput(init.startAt), endAt: toLocalInput(init.endAt),
    contactId: init.contactId ?? '', propertyId: init.propertyId ?? '', recurrence: init.recurrence as string, recurrenceUntil: init.recurrenceUntil ?? '', reminder: init.reminderMinutes == null ? '' : String(init.reminderMinutes),
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const contacts = useQuery({ queryKey: ['contacts', '', ''], queryFn: () => get<Contact[]>('/contacts'), enabled: adv });
  const props = useQuery({ queryKey: ['properties', '', ''], queryFn: () => get<Property[]>('/properties'), enabled: adv });

  const payload = () => {
    const startAt = d.allDay ? fromLocalInput(`${d.startAt.slice(0, 10)}T00:00`) : fromLocalInput(d.startAt);
    const endAt = d.allDay ? fromLocalInput(`${(d.endAt || d.startAt).slice(0, 10)}T00:00`) : fromLocalInput(d.endAt);
    return {
      title: d.title, description: d.description, kind: d.kind, allDay: d.allDay, location: d.location, startAt, endAt,
      contactId: d.contactId || null, propertyId: d.propertyId || null, recurrence: d.recurrence, recurrenceUntil: d.recurrence !== 'none' && d.recurrenceUntil ? d.recurrenceUntil : null,
      reminderMinutes: d.reminder === '' ? null : Number(d.reminder),
    };
  };
  const done = () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose(); };
  const save = useMutation({ mutationFn: () => (event ? patch(`/events/${event.id}`, payload()) : post('/events', payload())), onSuccess: done });
  const remove = useMutation({ mutationFn: () => del(`/events/${event!.id}`), onSuccess: done });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  const lock = (children: React.ReactNode) => adv ? children : <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900"><PremiumBadge /> {t('Recurring events, reminders & links')}</div><div className="pointer-events-none opacity-50">{children}</div><Link to="/app/billing" className="mt-2 inline-block text-sm font-semibold text-amber-800 underline">{t('Upgrade to unlock')}</Link></div>;

  return (
    <Modal open onClose={onClose} title={event ? t('Edit event') : t('New event')} wide>
      <form onSubmit={submit} className="space-y-4">
        <TextInput label={t('Title')} required autoFocus value={d.title} onChange={(e) => set('title', e.target.value)} placeholder={t('e.g. Viewing – Lake View Condo')} />
        <div className="grid grid-cols-2 gap-3">
          <Select label={t('Type')} value={d.kind} onChange={(e) => set('kind', e.target.value)}>{EVENT_KINDS.map((k) => <option key={k} value={k}>{tEnum(k)}</option>)}</Select>
          <TextInput label={t('Location')} value={d.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <Toggle label={t('All day')} checked={d.allDay} onChange={(v) => set('allDay', v)} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label={t('Starts')} type={d.allDay ? 'date' : 'datetime-local'} required value={d.allDay ? d.startAt.slice(0, 10) : d.startAt} onChange={(e) => set('startAt', e.target.value)} />
          <TextInput label={t('Ends')} type={d.allDay ? 'date' : 'datetime-local'} required value={d.allDay ? d.endAt.slice(0, 10) : d.endAt} onChange={(e) => set('endAt', e.target.value)} />
        </div>
        {lock(
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('Repeat')} value={d.recurrence} onChange={(e) => set('recurrence', e.target.value)}>{RECURRENCES.map((r) => <option key={r} value={r}>{r === 'none' ? t('Does not repeat') : tEnum(r)}</option>)}</Select>
              {d.recurrence !== 'none' ? <TextInput label={t('Repeat until')} type="date" value={d.recurrenceUntil} onChange={(e) => set('recurrenceUntil', e.target.value)} /> : <Select label={t('Reminder')} value={d.reminder} onChange={(e) => set('reminder', e.target.value)}>{REMINDERS.map((r) => <option key={r.v} value={r.v}>{t(r.l)}</option>)}</Select>}
            </div>
            {d.recurrence !== 'none' && <Select label={t('Reminder')} value={d.reminder} onChange={(e) => set('reminder', e.target.value)}>{REMINDERS.map((r) => <option key={r.v} value={r.v}>{t(r.l)}</option>)}</Select>}
            <div className="grid grid-cols-2 gap-3">
              <Select label={t('Contact')} value={d.contactId} onChange={(e) => set('contactId', e.target.value)}><option value="">—</option>{contacts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select label={t('Property')} value={d.propertyId} onChange={(e) => set('propertyId', e.target.value)}><option value="">—</option>{props.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
            </div>
          </div>,
        )}
        <TextArea label={t('Notes')} rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} />
        {event && event.recurrence !== 'none' && <p className="text-xs text-stone-500">{t('This is a repeating event — changes apply to the whole series.')}</p>}
        <ErrorNote error={save.error ?? remove.error} />
        <div className="flex justify-between gap-2">
          {event ? <Button type="button" variant="danger" loading={remove.isPending} onClick={() => confirm(event.recurrence !== 'none' ? t('Delete the whole series?') : t('Delete this event?')) && remove.mutate()}>{t('Delete')}</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button type="submit" loading={save.isPending}>{t('Save')}</Button></div>
        </div>
      </form>
    </Modal>
  );
}

function FeedModal({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:/, 'webcal:');
  return (
    <Modal open onClose={onClose} title={t('Sync with your phone calendar')}>
      <p className="text-sm text-stone-600">{t('Subscribe in Google Calendar, Apple Calendar or Outlook to see your Khondo events (including recurring events and bill due dates) alongside everything else. Anyone with this link can see your schedule — keep it private.')}</p>
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-3 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* ignore */ } }}>{copied ? t('Copied!') : t('Copy link')}</Button>
        <a href={webcal} className="inline-flex items-center rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-50">{t('Open in calendar app')}</a>
      </div>
    </Modal>
  );
}
