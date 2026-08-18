import { money } from '../../utils/format';
import { ITEM_STATUS } from '../../utils/constants';
import { useLongPress } from '../../hooks/useLongPress';

const catLine = (item) =>
  [item.category, item.sport, item.league, item.itemType].filter(Boolean).join(' · ');

// A Pinterest-style tile: photo-forward, natural aspect ratio (so the grid
// masonries), tap to open, long-press the photo (or the ⤢ button) to lightbox.
const ItemGridCard = ({ item, onOpen, onLightbox }) => {
  const sold = item.status === ITEM_STATUS.SOLD;
  const thumb = item.photos?.[0]?.url;
  const profit =
    sold && item.sold?.price != null && item.pricePaid != null
      ? item.sold.price - item.pricePaid - (item.sold.fees || 0)
      : null;

  const lp = useLongPress(() => thumb && onLightbox());
  const handleClick = () => {
    if (lp.didLongPress()) return; // long-press opened the lightbox; don't also open detail
    onOpen();
  };

  return (
    <div className="mb-3 break-inside-avoid overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="relative">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            {...lp.handlers}
            onClick={handleClick}
            className="w-full cursor-pointer select-none object-cover [-webkit-touch-callout:none]"
          />
        ) : (
          <div
            onClick={handleClick}
            className="flex aspect-square w-full cursor-pointer items-center justify-center bg-slate-100 text-4xl text-slate-300"
          >
            🗃️
          </div>
        )}

        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            sold ? 'bg-emerald-600 text-white' : 'bg-white/90 text-slate-700'
          }`}
        >
          {sold ? 'Sold' : 'In stock'}
        </span>

        {thumb && (
          <button
            onClick={(e) => { e.stopPropagation(); onLightbox(); }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-sm text-white hover:bg-black/70"
            title="View photo"
          >
            ⤢
          </button>
        )}
      </div>

      <div onClick={handleClick} className="cursor-pointer p-3">
        <div className="truncate text-sm font-medium text-slate-900">{item.name || 'Untitled item'}</div>
        {catLine(item) && <div className="mt-0.5 truncate text-xs text-slate-500">{catLine(item)}</div>}

        <div className="mt-1.5 flex items-center justify-between">
          <div className="text-sm">
            {sold ? (
              <span className="font-semibold text-slate-900">{money(item.sold?.price)}</span>
            ) : item.pricePaid != null ? (
              <span className="text-slate-600">{money(item.pricePaid)}</span>
            ) : (
              <span className="text-xs text-slate-300">no cost</span>
            )}
          </div>
          {profit != null && (
            <span className={`text-xs font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {profit >= 0 ? '+' : ''}{money(profit)}
            </span>
          )}
        </div>

        {(item.graded || (item.tags || []).length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.graded && (
              <span className="chip bg-amber-100 text-amber-700">
                {item.gradingCompany?.split(' ')[0] || 'Graded'} {item.grade || ''}
              </span>
            )}
            {(item.tags || []).slice(0, 3).map((t) => (
              <span key={t} className="chip">#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemGridCard;
