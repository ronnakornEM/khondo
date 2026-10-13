import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Bill, BillStatus } from '@shared/types';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, money, titleCase } from '@/lib/format';
import { Badge, EmptyState, ErrorNote, LinkButton, PageHeader, PageLoader, Stat, UpgradePrompt, cx } from '@/components/ui';

export const BILL_TONE: Record<BillStatus | 'overdue', 'gray' | 'blue' | 'green' | 'red'> = { draft: 'gray', sent: 'blue', paid: 'green', void: 'gray', overdue: 'red' };

export function BillsPage() {
  const { isPremium } = useAuth();
  if (!isPremium) return (<><PageHeader title="Bills" /><UpgradePrompt feature="bills" text="Create professional bills for rent, deposits, commissions and utilities. Track what’s sent, paid and overdue, and print or save as PDF." /></>);
  return <BillsInner />;
}

const FILTERS = ['', 'draft', 'sent', 'overdue', 'paid', 'void'];

function BillsInner() {
  const [status, setStatus] = useState('');
  const all = useQuery({ queryKey: ['bills', ''], queryFn: () => get<Bill[]>('/bills') });
  const list = status ? all.data?.filter((b) => (status === 'overdue' ? b.overdue : b.status === status)) : all.data;
  const month = new Date().toISOString().slice(0, 7);
  const outstanding = all.data?.filter((b) => b.status === 'sent').reduce((s, b) => s + b.total, 0) ?? 0;
  const overdue = all.data?.filter((b) => b.overdue).reduce((s, b) => s + b.total, 0) ?? 0;
  const paidMonth = all.data?.filter((b) => b.status === 'paid' && b.paidAt?.startsWith(month)).reduce((s, b) => s + b.total, 0) ?? 0;

  return (
    <>
      <PageHeader title="Bills" subtitle="Rent, deposits, commissions and more." actions={<LinkButton to="/app/bills/new"><Plus className="size-4" /> New bill</LinkButton>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Outstanding" value={money(outstanding)} />
        <Stat label="Overdue" value={money(overdue)} tone={overdue ? 'text-red-600' : undefined} />
        <Stat label="Paid this month" value={money(paidMonth)} tone="text-emerald-700" />
      </div>
      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((s) => <button key={s} onClick={() => setStatus(s)} className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold', status === s ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 bg-white text-stone-600')}>{s ? titleCase(s) : 'All'}</button>)}
      </div>
      {all.isLoading ? <PageLoader /> : all.error ? <ErrorNote error={all.error} /> : !list?.length ? (
        <EmptyState icon={<FileText className="size-6" />} title={status ? 'No bills here' : 'Create your first bill'} text="Bills you create show up here with their status." action={!status && <LinkButton to="/app/bills/new">New bill</LinkButton>} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {list.map((b) => (
            <li key={b.id}>
              <Link to={`/app/bills/${b.id}`} className="flex items-center gap-3 border-b border-stone-100 p-4 last:border-0 hover:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-bold">{b.number}</span><Badge tone={BILL_TONE[b.overdue ? 'overdue' : b.status]}>{b.overdue ? 'Overdue' : titleCase(b.status)}</Badge></div>
                  <div className="truncate text-sm text-stone-500">{[b.contactName, b.propertyTitle, titleCase(b.kind)].filter(Boolean).join(' · ')}</div>
                  <div className="text-xs text-stone-400">Issued {dateLabel(b.issueDate)}{b.dueDate ? ` · due ${dateLabel(b.dueDate)}` : ''}</div>
                </div>
                <div className="text-right font-extrabold">{money(b.total)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
