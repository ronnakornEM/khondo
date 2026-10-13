import { useRef, useState } from 'react';
import { ImagePlus, Link2, Star, Trash2 } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { shrinkImage } from '@/lib/image';
import { Button, cx } from './ui';

export async function uploadImage(file: File): Promise<string> {
  const blob = await shrinkImage(file);
  const form = new FormData();
  form.append('file', blob, 'photo.jpg');
  return (await api<{ url: string }>('/uploads', { form })).url;
}

export function ImageUploader({ photos, onChange, max }: { photos: string[]; onChange: (p: string[]) => void; max: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [uploadsOff, setUploadsOff] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    const added: string[] = [];
    try {
      for (const f of Array.from(files).slice(0, max - photos.length)) added.push(await uploadImage(f));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'uploads_disabled') setUploadsOff(true);
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      if (added.length) onChange([...photos, ...added]);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const addUrl = () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return setError('Enter a full image link starting with https://');
    setError('');
    onChange([...photos, u]);
    setUrl('');
  };

  const makeCover = (i: number) => onChange([photos[i], ...photos.filter((_, j) => j !== i)]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <div key={p + i} className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100">
            <img src={p} alt="" className="size-full object-cover" loading="lazy" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold text-white">Cover</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 p-1.5">
              {i !== 0 && (
                <button type="button" onClick={() => makeCover(i)} className="rounded-full bg-white/90 p-1.5 text-stone-700" aria-label="Make cover">
                  <Star className="size-3.5" />
                </button>
              )}
              <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="rounded-full bg-white/90 p-1.5 text-red-600" aria-label="Remove photo">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        {photos.length < max && !uploadsOff && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={cx('flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-xs font-semibold text-stone-500 hover:border-brand-600 hover:text-brand-700', busy && 'opacity-60')}
          >
            <ImagePlus className="size-6" />
            {busy ? 'Uploading…' : 'Add photos'}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      {photos.length < max && (
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
              placeholder="…or paste an image link"
              className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3"
            />
          </div>
          <Button type="button" variant="secondary" onClick={addUrl}>
            Add
          </Button>
        </div>
      )}
      <p className="mt-2 text-xs text-stone-500">
        {photos.length}/{max} photos · the first photo is the cover.{uploadsOff && ' Uploading is not enabled on this server yet — paste links instead.'}
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
