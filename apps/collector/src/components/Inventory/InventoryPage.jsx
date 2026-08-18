import { useMemo, useState } from 'react';
import { useShop } from '../../contexts/ShopContext';
import { ITEM_STATUS, itemTaxaText } from '../../utils/constants';
import { money } from '../../utils/format';
import LoadingSpinner from '../Layout/LoadingSpinner';
import QuickAdd from './QuickAdd';
import ItemCard from './ItemCard';
import ItemGridCard from './ItemGridCard';
import ItemDetail from './ItemDetail';
import VoiceBulkAdd from './VoiceBulkAdd';
import Lightbox from './Lightbox';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: ITEM_STATUS.INVENTORY, label: 'In stock' },
  { key: ITEM_STATUS.SOLD, label: 'Sold' },
];

const InventoryPage = () => {
  const { items, itemsLoading, itemsError } = useShop();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [bulkVoice, setBulkVoice] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { url, name }
  const [view, setView] = useState(() => localStorage.getItem('collector.view') || 'grid');

  const setViewMode = (v) => {
    setView(v);
    localStorage.setItem('collector.view', v);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        it.name,
        itemTaxaText(it),
        it.acquiredFrom,
        it.assignedTo,
        it.gradingCompany,
        it.notes,
        ...(it.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, statusFilter, search]);

  const inStock = items.filter((i) => i.status === ITEM_STATUS.INVENTORY);
  const stockValue = inStock.reduce((sum, i) => sum + (i.pricePaid || 0), 0);

  const selected = items.find((i) => i.id === selectedId) || null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <QuickAdd onOpenDetailed={() => setCreating(true)} onOpenBulk={() => setBulkVoice(true)} />

      {/* Quick stock summary */}
      <div className="mt-3 flex items-center gap-4 px-1 text-sm text-slate-500">
        <span><strong className="text-slate-900">{inStock.length}</strong> in stock</span>
        <span><strong className="text-slate-900">{money(stockValue)}</strong> cost basis</span>
        <span><strong className="text-slate-900">{items.length}</strong> total</span>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="field sm:max-w-xs"
          placeholder="Search name, tag, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  statusFilter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-md px-2.5 py-1.5 ${view === 'grid' ? 'bg-white shadow-sm' : 'text-slate-400'}`}
              title="Card grid"
              aria-label="Card grid"
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md px-2.5 py-1.5 ${view === 'list' ? 'bg-white shadow-sm' : 'text-slate-400'}`}
              title="List"
              aria-label="List"
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="mt-4">
        {itemsLoading ? (
          <LoadingSpinner label="Loading your collection…" />
        ) : itemsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
            Couldn&apos;t load items. Check your connection and refresh — if it keeps
            happening, the shop&apos;s security rules may not be deployed yet.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-slate-400">
            {items.length === 0
              ? 'Nothing here yet. Add your first item above ☝️'
              : 'No items match that filter.'}
          </div>
        ) : view === 'grid' ? (
          <div className="columns-2 gap-3 sm:columns-3">
            {filtered.map((it) => (
              <ItemGridCard
                key={it.id}
                item={it}
                onOpen={() => setSelectedId(it.id)}
                onLightbox={() =>
                  it.photos?.[0] && setLightbox({ url: it.photos[0].url, name: it.name })
                }
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((it) => (
              <ItemCard key={it.id} item={it} onClick={() => setSelectedId(it.id)} />
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />
      )}
      {bulkVoice && <VoiceBulkAdd onClose={() => setBulkVoice(false)} />}
      {creating && <ItemDetail mode="create" onClose={() => setCreating(false)} />}
      {selected && (
        <ItemDetail mode="edit" item={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
};

export default InventoryPage;
