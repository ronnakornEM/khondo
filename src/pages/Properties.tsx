import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PROPERTY_STATUSES, type Property } from '@shared/types';
import { get } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PropertyCard } from '@/components/PropertyCard';
import { EmptyState, ErrorNote, LinkButton, PageHeader, PageLoader, cx, btnClass } from '@/components/ui';
import { titleCase } from '@/lib/format';

export function PropertiesPage() {
  const { me, limits } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const list = useQuery({
    queryKey: ['properties', status, q],
    queryFn: () => get<Property[]>(`/properties?${new URLSearchParams({ ...(status && { status }), ...(q && { q }) })}`),
  });
  const used = me!.usage.properties;
  const atLimit = used >= limits.maxProperties;

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle={`${used} of ${limits.maxProperties} listings used on the ${limits.label} plan`}
        actions={
          atLimit ? (
            <Link to="/app/billing" className={btnClass('premium')}>
              Upgrade for more listings
            </Link>
          ) : (
            <LinkButton to="/app/properties/new">
              <Plus className="size-4" /> Add property
            </LinkButton>
          )
        }
      />
      {me!.hiddenProperties > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {me!.hiddenProperties} published listing{me!.hiddenProperties > 1 ? 's are' : ' is'} not shown on your public page because you’re over the Free plan limit.{' '}
          <Link to="/app/billing" className="font-semibold underline">
            Upgrade to show them all
          </Link>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, district, address…" className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3" />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {['', ...PROPERTY_STATUSES].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold', status === s ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 bg-white text-stone-600')}>
              {s ? titleCase(s) : 'All'}
            </button>
          ))}
        </div>
      </div>
      {list.isLoading ? (
        <PageLoader />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : !list.data?.length ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title={q || status ? 'No matching properties' : 'Add your first property'}
          text={q || status ? 'Try a different search or filter.' : 'Your listings appear here and on your public landing page.'}
          action={!q && !status && <LinkButton to="/app/properties/new">Add property</LinkButton>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((p) => (
            <PropertyCard key={p.id} p={p} to={`/app/properties/${p.id}`} />
          ))}
        </div>
      )}
    </>
  );
}
