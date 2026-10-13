import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES, type Property } from '@shared/types';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { titleCase } from '@/lib/format';
import { ImageUploader } from '@/components/ImageUploader';
import { Button, Card, ErrorNote, PageLoader, Select, TextArea, TextInput, Toggle, cx, btnClass } from '@/components/ui';

const AMENITIES = ['Swimming pool', 'Fitness', 'Parking', '24h security', 'Elevator', 'Garden', 'Co-working', 'Sauna', 'Furnished', 'Pet friendly', 'Near KKU', 'Near Central Khon Kaen', 'Lake view', 'Balcony', 'Fibre internet'];

interface Form {
  title: string; description: string; type: string; listingType: string; status: string;
  price: string; rentPrice: string; bedrooms: string; bathrooms: string; areaSqm: string; landSqw: string; floor: string;
  address: string; district: string; province: string; latitude: string; longitude: string;
  amenities: string[]; photos: string[]; featured: boolean; published: boolean;
}

const blank: Form = {
  title: '', description: '', type: 'condo', listingType: 'sale', status: 'available',
  price: '', rentPrice: '', bedrooms: '', bathrooms: '', areaSqm: '', landSqw: '', floor: '',
  address: '', district: '', province: 'Khon Kaen', latitude: '', longitude: '',
  amenities: [], photos: [], featured: false, published: true,
};

const s = (v: unknown) => (v == null ? '' : String(v));
const fromProperty = (p: Property): Form => ({
  title: p.title, description: p.description, type: p.type, listingType: p.listingType, status: p.status,
  price: s(p.price), rentPrice: s(p.rentPrice), bedrooms: s(p.bedrooms), bathrooms: s(p.bathrooms), areaSqm: s(p.areaSqm), landSqw: s(p.landSqw), floor: s(p.floor),
  address: p.address, district: p.district, province: p.province, latitude: s(p.latitude), longitude: s(p.longitude),
  amenities: p.amenities, photos: p.photos, featured: p.featured, published: p.published,
});

export function PropertyEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { limits, refresh } = useAuth();
  const [f, setF] = useState<Form>(blank);
  const [extraAmenity, setExtraAmenity] = useState('');

  const existing = useQuery({ queryKey: ['property', id], queryFn: () => get<Property>(`/properties/${id}`), enabled: !isNew });
  useEffect(() => {
    if (existing.data) setF(fromProperty(existing.data));
  }, [existing.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: () => (isNew ? post<Property>('/properties', f) : patch<Property>(`/properties/${id}`, f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.removeQueries({ queryKey: ['property', id] });
      refresh();
      nav('/app/properties');
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/properties/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      refresh();
      nav('/app/properties');
    },
  });

  if (!isNew && existing.isLoading) return <PageLoader />;
  if (!isNew && existing.error) return <ErrorNote error={existing.error} />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const showSale = f.listingType !== 'rent';
  const showRent = f.listingType !== 'sale';
  const isLand = f.type === 'land';
  const limitErr = save.error instanceof ApiError && save.error.isPremiumGate;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <Link to="/app/properties" className="inline-flex items-center gap-1 text-sm font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="size-4" /> Properties
        </Link>
        {!isNew && (
          <Button type="button" variant="danger" size="sm" loading={remove.isPending} onClick={() => confirm('Delete this property? This cannot be undone.') && remove.mutate()}>
            <Trash2 className="size-4" /> Delete
          </Button>
        )}
      </div>
      <h1 className="text-2xl font-extrabold">{isNew ? 'Add property' : 'Edit property'}</h1>

      <Card className="space-y-4">
        <TextInput label="Title" required maxLength={160} placeholder="e.g. Modern 1-bed condo near Central Khon Kaen" value={f.title} onChange={(e) => set('title', e.target.value)} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Select label="Type" value={f.type} onChange={(e) => set('type', e.target.value)}>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
          <Select label="Listing" value={f.listingType} onChange={(e) => set('listingType', e.target.value)}>
            {LISTING_TYPES.map((t) => <option key={t} value={t}>{t === 'both' ? 'Sale & rent' : `For ${t}`}</option>)}
          </Select>
          <Select label="Status" className="col-span-2 sm:col-span-1" value={f.status} onChange={(e) => set('status', e.target.value)}>
            {PROPERTY_STATUSES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {showSale && <TextInput label="Sale price (฿)" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} />}
          {showRent && <TextInput label="Rent per month (฿)" inputMode="decimal" value={f.rentPrice} onChange={(e) => set('rentPrice', e.target.value)} />}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {!isLand && <TextInput label="Bedrooms" inputMode="numeric" value={f.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} />}
          {!isLand && <TextInput label="Bathrooms" inputMode="numeric" value={f.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} />}
          {!isLand && <TextInput label="Area (m²)" inputMode="decimal" value={f.areaSqm} onChange={(e) => set('areaSqm', e.target.value)} />}
          {(isLand || ['house', 'townhouse', 'commercial'].includes(f.type)) && <TextInput label="Land (ตร.ว. / sq wah)" inputMode="decimal" value={f.landSqw} onChange={(e) => set('landSqw', e.target.value)} />}
          {['condo', 'apartment'].includes(f.type) && <TextInput label="Floor" inputMode="numeric" value={f.floor} onChange={(e) => set('floor', e.target.value)} />}
        </div>
        <TextArea label="Description" rows={6} maxLength={8000} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Highlights, nearby places, condition, what's included…" />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Photos</h2>
        <ImageUploader photos={f.photos} onChange={(p) => set('photos', p)} max={limits.maxPhotosPerProperty} />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">Location</h2>
        <TextInput label="Address / project name" value={f.address} onChange={(e) => set('address', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="District (อำเภอ/ตำบล)" placeholder="Mueang Khon Kaen" value={f.district} onChange={(e) => set('district', e.target.value)} />
          <TextInput label="Province" value={f.province} onChange={(e) => set('province', e.target.value)} />
          <TextInput label="Latitude" inputMode="decimal" placeholder="16.4419" value={f.latitude} onChange={(e) => set('latitude', e.target.value)} />
          <TextInput label="Longitude" inputMode="decimal" placeholder="102.8360" value={f.longitude} onChange={(e) => set('longitude', e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Amenities</h2>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...AMENITIES, ...f.amenities])].map((a) => {
            const on = f.amenities.includes(a);
            return (
              <button type="button" key={a} onClick={() => set('amenities', on ? f.amenities.filter((x) => x !== a) : [...f.amenities, a])} className={cx('rounded-full border px-3 py-1.5 text-sm font-medium', on ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-stone-300 bg-white text-stone-600')}>
                {a}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input value={extraAmenity} onChange={(e) => setExtraAmenity(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = extraAmenity.trim(); if (v && !f.amenities.includes(v)) set('amenities', [...f.amenities, v]); setExtraAmenity(''); } }} placeholder="Add your own…" className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2" />
        </div>
      </Card>

      <Card>
        <Toggle label="Published" hint="Show this property on your public landing page." checked={f.published} onChange={(v) => set('published', v)} />
        <Toggle label="Featured" hint="Pin to the top of your landing page." checked={f.featured} onChange={(v) => set('featured', v)} />
      </Card>

      {save.error && (
        <div className="space-y-2">
          <ErrorNote error={save.error} />
          {limitErr && <Link to="/app/billing" className={btnClass('premium', 'sm')}>See Premium</Link>}
        </div>
      )}
      <div className="fixed inset-x-0 bottom-[calc(3.6rem+var(--safe-bottom))] z-20 border-t border-stone-200 bg-white/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-3xl justify-end gap-2">
          <Link to="/app/properties" className={btnClass('secondary')}>Cancel</Link>
          <Button type="submit" loading={save.isPending}>{isNew ? 'Add property' : 'Save changes'}</Button>
        </div>
      </div>
    </form>
  );
}
