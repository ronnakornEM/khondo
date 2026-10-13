import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageCircle, Phone, Plus, Search, Users } from 'lucide-react';
import { CONTACT_KINDS, CONTACT_STAGES, type Contact, type ContactStage, type Property } from '@shared/types';
import { del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, lineUrl, money, titleCase, whatsappLikeTel } from '@/lib/format';
import { Badge, Button, EmptyState, ErrorNote, Modal, PageHeader, PageLoader, Select, TextArea, TextInput, UpgradePrompt, cx } from '@/components/ui';

const STAGE_TONE: Record<ContactStage, 'gray' | 'blue' | 'amber' | 'purple' | 'green' | 'red'> = { new: 'blue', contacted: 'gray', viewing: 'amber', negotiating: 'purple', won: 'green', lost: 'red' };

interface Draft { name: string; phone: string; email: string; lineId: string; kind: string; stage: string; propertyId: string; budget: string; tags: string; notes: string }
const blank: Draft = { name: '', phone: '', email: '', lineId: '', kind: 'buyer', stage: 'new', propertyId: '', budget: '', tags: '', notes: '' };
const toDraft = (c: Contact): Draft => ({ name: c.name, phone: c.phone, email: c.email, lineId: c.lineId, kind: c.kind, stage: c.stage, propertyId: c.propertyId ?? '', budget: c.budget == null ? '' : String(c.budget), tags: c.tags.join(', '), notes: c.notes });

export function ContactsPage() {
  const { isPremium } = useAuth();
  if (!isPremium) return (<><PageHeader title="Contacts" /><UpgradePrompt feature="contacts" text="Keep every buyer, seller, tenant and landlord in one place — with a sales pipeline, notes, tags and one-tap call / LINE / email." /></>);
  return <ContactsInner />;
}

function ContactsInner() {
  const qc = useQueryClient();
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const list = useQuery({ queryKey: ['contacts', stage, q], queryFn: () => get<Contact[]>(`/contacts?${new URLSearchParams({ ...(stage && { stage }), ...(q && { q }) })}`) });
  const setStageFor = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => patch(`/contacts/${id}`, { stage }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });

  return (
    <>
      <PageHeader title="Contacts" subtitle="Your buyers, sellers, tenants and landlords." actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" /> Add contact</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, tag, notes…" className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3" />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {['', ...CONTACT_STAGES].map((s) => (
            <button key={s} onClick={() => setStage(s)} className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold', stage === s ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 bg-white text-stone-600')}>{s ? titleCase(s) : 'All'}</button>
          ))}
        </div>
      </div>
      {list.isLoading ? <PageLoader /> : list.error ? <ErrorNote error={list.error} /> : !list.data?.length ? (
        <EmptyState icon={<Users className="size-6" />} title={q || stage ? 'No matching contacts' : 'No contacts yet'} text={q || stage ? 'Try another search or stage.' : 'Add a contact, or convert an inquiry from your landing page.'} action={!q && !stage && <Button onClick={() => setEditing('new')}>Add contact</Button>} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {list.data.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 border-b border-stone-100 p-4 last:border-0 sm:flex-row sm:items-center">
              <button onClick={() => setEditing(c)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{c.name}</span><Badge>{titleCase(c.kind)}</Badge>{c.tags.slice(0, 3).map((t) => <Badge key={t} tone="teal">{t}</Badge>)}</div>
                <div className="mt-0.5 truncate text-sm text-stone-500">{[c.phone, c.email, c.propertyTitle && `re: ${c.propertyTitle}`, c.budget != null && `budget ${money(c.budget)}`].filter(Boolean).join(' · ') || 'No details yet'}</div>
                <div className="text-xs text-stone-400">Added {dateLabel(c.createdAt)} · {c.source}</div>
              </button>
              <div className="flex items-center gap-2">
                <select value={c.stage} onChange={(e) => setStageFor.mutate({ id: c.id, stage: e.target.value })} aria-label="Stage" className="rounded-lg border border-stone-300 bg-white py-1.5 pl-2 pr-7 text-sm font-semibold">
                  {CONTACT_STAGES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </select>
                <Badge tone={STAGE_TONE[c.stage]}>{titleCase(c.stage)}</Badge>
                {c.phone && <a href={`tel:${whatsappLikeTel(c.phone)}`} aria-label="Call" className="rounded-full bg-brand-50 p-2 text-brand-800"><Phone className="size-4" /></a>}
                {c.lineId && <a href={lineUrl(c.lineId)} target="_blank" rel="noreferrer" aria-label="LINE" className="rounded-full bg-emerald-50 p-2 text-emerald-700"><MessageCircle className="size-4" /></a>}
                {c.email && <a href={`mailto:${c.email}`} aria-label="Email" className="rounded-full bg-brand-50 p-2 text-brand-800"><Mail className="size-4" /></a>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <ContactModal contact={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ContactModal({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(contact ? toDraft(contact) : blank);
  const props = useQuery({ queryKey: ['properties', '', ''], queryFn: () => get<Property[]>('/properties') });
  const set = (k: keyof Draft, v: string) => setD((x) => ({ ...x, [k]: v }));
  const done = () => { qc.invalidateQueries({ queryKey: ['contacts'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); onClose(); };
  const payload = () => ({ ...d, propertyId: d.propertyId || null, tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean), lastContactedAt: undefined });
  const save = useMutation({ mutationFn: () => (contact ? patch(`/contacts/${contact.id}`, payload()) : post('/contacts', payload())), onSuccess: done });
  const remove = useMutation({ mutationFn: () => del(`/contacts/${contact!.id}`), onSuccess: done });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <Modal open onClose={onClose} title={contact ? 'Edit contact' : 'New contact'} wide>
      <form onSubmit={submit} className="space-y-4">
        <TextInput label="Name" required value={d.name} onChange={(e) => set('name', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Phone" inputMode="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
          <TextInput label="LINE ID" value={d.lineId} onChange={(e) => set('lineId', e.target.value)} />
        </div>
        <TextInput label="Email" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Type" value={d.kind} onChange={(e) => set('kind', e.target.value)}>{CONTACT_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select>
          <Select label="Stage" value={d.stage} onChange={(e) => set('stage', e.target.value)}>{CONTACT_STAGES.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Interested in" value={d.propertyId} onChange={(e) => set('propertyId', e.target.value)}>
            <option value="">—</option>
            {props.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
          <TextInput label="Budget (฿)" inputMode="decimal" value={d.budget} onChange={(e) => set('budget', e.target.value)} />
        </div>
        <TextInput label="Tags" hint="Comma separated, e.g. vip, cash buyer, near KKU" value={d.tags} onChange={(e) => set('tags', e.target.value)} />
        <TextArea label="Notes" rows={4} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        <ErrorNote error={save.error ?? remove.error} />
        <div className="flex justify-between gap-2">
          {contact ? <Button type="button" variant="danger" loading={remove.isPending} onClick={() => confirm(`Delete ${contact.name}?`) && remove.mutate()}>Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
        </div>
      </form>
    </Modal>
  );
}
