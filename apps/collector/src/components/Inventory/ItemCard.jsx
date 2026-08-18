import { money } from '../../utils/format';
import { ITEM_STATUS } from '../../utils/constants';

const categoryLine = (item) => {
  const bits = [item.category, item.sport, item.league, item.itemType].filter(Boolean);
  return bits.join(' · ');
};

const ItemCard = ({ item, onClick }) => {
  const sold = item.status === ITEM_STATUS.SOLD;
  const thumb = item.photos?.[0]?.url;
  const profit =
    sold && item.sold?.price != null && item.pricePaid != null
      ? item.sold.price - item.pricePaid - (item.sold.fees || 0)
      : null;

  return (
    <button
      onClick={onClick}
      className="card flex w-full items-center gap-3 p-3 text-left transition hover:shadow-md"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-slate-300">
            🗃️
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-medium text-slate-900">
            {item.name || 'Untitled item'}
          </div>
          {sold ? (
            <span className="chip shrink-0 bg-emerald-100 text-emerald-700">Sold</span>
          ) : (
            <span className="chip shrink-0 bg-sky-100 text-sky-700">In stock</span>
          )}
        </div>

        {categoryLine(item) && (
          <div className="mt-0.5 truncate text-xs text-slate-500">{categoryLine(item)}</div>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {item.graded && (
            <span className="chip bg-amber-100 text-amber-700">
              {item.gradingCompany?.split(' ')[0] || 'Graded'} {item.grade || ''}
            </span>
          )}
          {(item.tags || []).slice(0, 2).map((t) => (
            <span key={t} className="chip">#{t}</span>
          ))}
          {(item.tags || []).length > 2 && (
            <span className="text-slate-400">+{item.tags.length - 2}</span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {sold ? (
          <>
            <div className="text-sm font-semibold text-slate-900">{money(item.sold?.price)}</div>
            {profit != null && (
              <div className={`text-xs font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {profit >= 0 ? '+' : ''}{money(profit)}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-500">
            {item.pricePaid != null ? money(item.pricePaid) : <span className="text-slate-300">no cost</span>}
          </div>
        )}
      </div>
    </button>
  );
};

export default ItemCard;
