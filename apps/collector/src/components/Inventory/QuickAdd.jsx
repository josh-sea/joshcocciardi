import { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useShop } from '../../contexts/ShopContext';
import { quickAddItem } from '../../services/items.service';
import { toNumberOrNull } from '../../utils/format';

// The whole point of the app: get an item in with as little friction as
// possible. Type a name, hit enter, keep going. Price is optional; everything
// else gets filled in later from the item card.
const QuickAdd = ({ onOpenDetailed, onOpenBulk }) => {
  const { user } = useAuth();
  const { activeShopId } = useShop();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState('');
  const nameRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !activeShopId) return;
    setSaving(true);
    try {
      await quickAddItem(activeShopId, user.uid, {
        name: trimmed,
        pricePaid: toNumberOrNull(price),
      });
      setJustAdded(trimmed);
      setName('');
      setPrice('');
      // Keep the cursor in the name field so they can keep rattling off items.
      nameRef.current?.focus();
      setTimeout(() => setJustAdded(''), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-3">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={nameRef}
          className="field flex-1"
          placeholder="Add an item — just the name is fine…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          disabled={saving}
        />
        <div className="flex gap-2">
          <div className="relative w-28">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              className="field pl-6"
              placeholder="Paid"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={saving}
            />
          </div>
          <button type="submit" className="btn-primary shrink-0" disabled={saving || !name.trim()}>
            Add
          </button>
        </div>
      </form>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            className="text-xs font-medium text-sky-600 hover:text-sky-700"
            onClick={onOpenDetailed}
          >
            + Add with full details
          </button>
          <button
            type="button"
            className="text-xs font-medium text-sky-600 hover:text-sky-700"
            onClick={onOpenBulk}
          >
            🎤 Bulk add by voice
          </button>
        </div>
        {justAdded && (
          <span className="shrink-0 text-xs text-emerald-600">Added “{justAdded}” ✓</span>
        )}
      </div>
    </div>
  );
};

export default QuickAdd;
