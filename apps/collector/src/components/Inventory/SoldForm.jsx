import { useState } from 'react';
import Modal from '../Layout/Modal';
import { SOLD_CHANNELS } from '../../utils/constants';
import { toNumberOrNull, money } from '../../utils/format';
import { markSold } from '../../services/items.service';

// Logging a sale. Only the amount really matters — where, to whom, and fees
// are all optional context that make the profit numbers sharper if filled in.
const SoldForm = ({ item, onClose, onSold }) => {
  const [price, setPrice] = useState(item.sold?.price ?? '');
  const [soldAt, setSoldAt] = useState(
    item.sold?.soldAt ? item.sold.soldAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [channel, setChannel] = useState(item.sold?.channel || '');
  const [buyer, setBuyer] = useState(item.sold?.buyer || '');
  const [fees, setFees] = useState(item.sold?.fees ?? '');
  const [notes, setNotes] = useState(item.sold?.notes || '');
  const [busy, setBusy] = useState(false);

  const priceNum = toNumberOrNull(price);
  const feesNum = toNumberOrNull(fees);
  const net =
    priceNum != null && item.pricePaid != null
      ? priceNum - item.pricePaid - (feesNum || 0)
      : null;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await markSold(item.id, {
        price: priceNum,
        soldAt: soldAt ? new Date(soldAt).toISOString() : new Date().toISOString(),
        channel,
        buyer,
        fees: feesNum,
        notes,
      });
      onSold?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Log sale — ${item.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label">Sold for *</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              className="field pl-6"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="field" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} />
          </div>
          <div>
            <label className="label">Fees (optional)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                className="field pl-6"
                inputMode="decimal"
                placeholder="0.00"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Sold where (optional)</label>
          <input
            className="field"
            list="sold-channels"
            placeholder="eBay, card show, Facebook…"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
          <datalist id="sold-channels">
            {SOLD_CHANNELS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div>
          <label className="label">Sold to (optional)</label>
          <input
            className="field"
            placeholder="Buyer name or handle"
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <textarea
            className="field"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {net != null && (
          <div className={`rounded-lg px-3 py-2 text-sm ${net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            Net profit after cost{feesNum ? ' and fees' : ''}:{' '}
            <strong>{net >= 0 ? '+' : ''}{money(net)}</strong>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-success flex-1" disabled={busy}>
            {busy ? 'Saving…' : 'Mark as sold'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SoldForm;
