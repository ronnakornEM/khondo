import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Plus, Printer, Trash2, X } from 'lucide-react';
import { BILL_KINDS, BILL_STATUSES, type Bill, type BillItem, type Contact, type Property } from '@shared/types';
import { del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, money2, tEnum } from '@/lib/format';
import { Badge, Button, Card, ErrorNote, PageHeader, PageLoader, Select, TextArea, TextInput, UpgradePrompt } from '@/components/ui';
import { BILL_TONE } from './Bills';
import { useT } from '@/lib/i18n';

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

interface Draft { contactId: string; propertyId: string; kind: string; status: string; issueDate: string; dueDate: string; notes: string; items: BillItem[] }
const blank = (): Draft => ({ contactId: '', propertyId: '', kind: 'rent', status: 'draft', issueDate: today(), dueDate: plusDays(7), notes: '', items: [{ description: '', qty: 1, unitPrice: 0 }] });

export function BillEditPage() {
  const { isPremium } = useAuth();
  if (!isPremium) return <UpgradePrompt feature="bills" />;
  return <Inner />;
}

function Inner() {
  const t = useT();
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();
  const [d, setD] = useState<Draft>(blank);
  const [invoice, setInvoice] = useState(false);

  const bill = useQuery({ queryKey: ['bill', id], queryFn: () => get<Bill>(`/bills/${id}`), enabled: !isNew });
  const contacts = useQuery({ queryKey: ['contacts', '', ''], queryFn: () => get<Contact[]>('/contacts') });
  const props = useQuery({ queryKey: ['properties', '', ''], queryFn: () => get<Property[]>('/properties') });

  useEffect(() => {
    const b = bill.data;
    if (b) setD({ contactId: b.contactId ?? '', propertyId: b.propertyId ?? '', kind: b.kind, status: b.status, issueDate: b.issueDate, dueDate: b.dueDate ?? '', notes: b.notes, items: b.items });
  }, [bill.data]);

  const total = d.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
  const payload = (over: Partial<Draft> = {}) => {
    const x = { ...d, ...over };
    return { ...x, contactId: x.contactId || null, propertyId: x.propertyId || null, dueDate: x.dueDate || null, items: x.items.map((i) => ({ description: i.description, qty: Number(i.qty) || 0, unitPrice: Number(i.unitPrice) || 0 })) };
  };
  const done = () => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.removeQueries({ queryKey: ['bill', id] }); };
  const save = useMutation({
    mutationFn: (over?: Partial<Draft>) => (isNew ? post<Bill>('/bills', payload(over)) : patch<Bill>(`/bills/${id}`, payload(over))),
    onSuccess: (b, over) => { done(); if (isNew || !over) nav(isNew ? `/app/bills/${b.id}` : '/app/bills'); else setD((x) => ({ ...x, ...over })); },
  });
  const remove = useMutation({ mutationFn: () => del(`/bills/${id}`), onSuccess: () => { done(); nav('/app/bills'); } });

  if (!isNew && bill.isLoading) return <PageLoader />;
  const setItem = (i: number, patchItem: Partial<BillItem>) => setD((x) => ({ ...x, items: x.items.map((it, n) => (n === i ? { ...it, ...patchItem } : it)) }));
  const set = (k: keyof Draft, v: string) => setD((x) => ({ ...x, [k]: v }));
  const contact = contacts.data?.find((c) => c.id === d.contactId);
  const property = props.data?.find((p) => p.id === d.propertyId);

  if (invoice) {
    const a = me!.agent;
    return (
      <div className="mx-auto max-w-3xl">
        <div className="no-print mb-4 flex justify-between">
          <Button variant="secondary" onClick={() => setInvoice(false)}><ArrowLeft className="size-4" /> {t('Back to edit')}</Button>
          <Button onClick={() => window.print()}><Printer className="size-4" /> {t('Print / Save as PDF')}</Button>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-8 print:border-0 print:p-0">
          <div className="flex justify-between gap-6">
            <div><div className="text-2xl font-extrabold">{a.displayName}</div><div className="text-sm text-stone-500">{[a.phone, a.contactEmail].filter(Boolean).join(' · ')}</div></div>
            <div className="text-right"><div className="text-3xl font-extrabold uppercase tracking-wide text-stone-300">{t('Invoice')}</div><div className="font-bold">{bill.data?.number ?? t('Draft')}</div></div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
            <div><div className="text-xs font-bold uppercase text-stone-400">{t('Billed to')}</div><div className="font-bold">{contact?.name ?? '—'}</div><div className="text-stone-500">{[contact?.phone, contact?.email].filter(Boolean).join(' · ')}</div></div>
            <div className="text-right"><div>{t('Issued:')} <b>{dateLabel(d.issueDate)}</b></div><div>{t('Due:')} <b>{d.dueDate ? dateLabel(d.dueDate) : t('On receipt')}</b></div>{property && <div className="text-stone-500">{t('Re:')} {property.title}</div>}</div>
          </div>
          <table className="mt-8 w-full text-sm">
            <thead><tr className="border-b-2 border-stone-800 text-left"><th className="py-2">{t('Description')}</th><th className="py-2 text-right">{t('Qty')}</th><th className="py-2 text-right">{t('Unit price')}</th><th className="py-2 text-right">{t('Amount')}</th></tr></thead>
            <tbody>{d.items.map((i, n) => <tr key={n} className="border-b border-stone-100"><td className="py-2">{i.description}</td><td className="py-2 text-right">{i.qty}</td><td className="py-2 text-right">{money2(Number(i.unitPrice))}</td><td className="py-2 text-right">{money2(i.qty * i.unitPrice)}</td></tr>)}</tbody>
          </table>
          <div className="mt-4 flex justify-end"><div className="w-64 border-t-2 border-stone-800 pt-2 text-right text-xl font-extrabold">{t('Total')} {money2(total)}</div></div>
          {d.status === 'paid' && <div className="mt-6 inline-block rotate-[-6deg] rounded-lg border-4 border-emerald-600 px-4 py-1 text-2xl font-extrabold uppercase text-emerald-600">{t('Paid')}</div>}
          {d.notes && <p className="mt-8 whitespace-pre-line text-sm text-stone-600">{d.notes}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <Link to="/app/bills" className="inline-flex items-center gap-1 text-sm font-semibold text-stone-500 hover:text-stone-800"><ArrowLeft className="size-4" /> {t('Bills')}</Link>
      <PageHeader title={isNew ? t('New bill') : bill.data?.number ?? t('Bill')} actions={bill.data && <Badge tone={BILL_TONE[bill.data.overdue ? 'overdue' : bill.data.status]}>{bill.data.overdue ? t('Overdue') : tEnum(bill.data.status)}</Badge>} />
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={t('Contact')} value={d.contactId} onChange={(e) => set('contactId', e.target.value)}><option value="">{t('— none —')}</option>{contacts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label={t('Property')} value={d.propertyId} onChange={(e) => set('propertyId', e.target.value)}><option value="">{t('— none —')}</option>{props.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
          <Select label={t('Type')} value={d.kind} onChange={(e) => set('kind', e.target.value)}>{BILL_KINDS.map((k) => <option key={k} value={k}>{tEnum(k)}</option>)}</Select>
          <Select label={t('Status')} value={d.status} onChange={(e) => set('status', e.target.value)}>{BILL_STATUSES.map((k) => <option key={k} value={k}>{tEnum(k)}</option>)}</Select>
          <TextInput label={t('Issue date')} type="date" value={d.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
          <TextInput label={t('Due date')} type="date" value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">{t('Line items')}</h2>
        {d.items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_6.5rem_auto] items-end gap-2">
            <TextInput label={i === 0 ? t('Description') : ''} aria-label={t('Description')} placeholder={t('e.g. Monthly rent – Nov')} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
            <TextInput label={i === 0 ? t('Qty') : ''} aria-label={t('Quantity')} inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value as unknown as number })} />
            <TextInput label={i === 0 ? t('Price') : ''} aria-label={t('Unit price')} inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value as unknown as number })} />
            <button type="button" aria-label={t('Remove line')} disabled={d.items.length === 1} onClick={() => setD((x) => ({ ...x, items: x.items.filter((_, n) => n !== i) }))} className="mb-1 rounded-full p-2 text-stone-400 hover:bg-stone-100 disabled:opacity-30"><X className="size-4" /></button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" size="sm" onClick={() => setD((x) => ({ ...x, items: [...x.items, { description: '', qty: 1, unitPrice: 0 }] }))}><Plus className="size-4" /> {t('Add line')}</Button>
          <div className="text-right"><div className="text-xs text-stone-500">{t('Total')}</div><div className="text-2xl font-extrabold">{money2(total)}</div></div>
        </div>
      </Card>
      <Card><TextArea label={t('Notes / payment details')} rows={3} placeholder={t('Bank account, PromptPay ID, terms…')} value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Card>
      <ErrorNote error={save.error ?? remove.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isNew ? <Button variant="danger" loading={remove.isPending} onClick={() => confirm(t('Delete this bill?')) && remove.mutate()}><Trash2 className="size-4" /> {t('Delete')}</Button> : <span />}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setInvoice(true)}><Printer className="size-4" /> {t('Invoice view')}</Button>
          {!isNew && d.status !== 'paid' && <Button variant="secondary" onClick={() => save.mutate({ status: 'paid' })}><CheckCircle2 className="size-4" /> {t('Mark paid')}</Button>}
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{isNew ? t('Create bill') : t('Save')}</Button>
        </div>
      </div>
    </div>
  );
}
