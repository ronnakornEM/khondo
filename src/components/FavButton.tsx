import { Heart } from 'lucide-react';
import { useFavorites } from '@/lib/favorites';
import { useT } from '@/lib/i18n';
import { cx } from './ui';

/** Heart toggle. Works for guests (saved in the browser) and signed-in users (saved to the account). */
export function FavButton({ id, className }: { id: string; className?: string }) {
  const t = useT();
  const { isFav, toggle } = useFavorites();
  const on = isFav(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t('Remove from saved') : t('Save property')}
      onClick={(e) => {
        e.preventDefault(); // the card around it is a link
        e.stopPropagation();
        toggle(id);
      }}
      className={cx('grid size-9 place-items-center rounded-full bg-white/90 text-stone-600 shadow transition hover:scale-110 hover:text-rose-500', className)}
    >
      <Heart className={cx('size-5', on && 'fill-rose-500 text-rose-500')} />
    </button>
  );
}
