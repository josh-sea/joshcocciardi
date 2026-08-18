import { useState } from 'react';
import Modal from '../Layout/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useShop } from '../../contexts/ShopContext';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { parseBulkItems, AI_ENABLED } from '../../services/ai.service';
import { addItem } from '../../services/items.service';
import { toNumberOrNull } from '../../utils/format';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Bulk-add by talking (or typing) a brain-dump. You rattle off what you have;
// the AI splits it into rows of {name, price}; you review/edit; one tap adds
// them all. Price is optional — say it if you know it, skip it if you don't.
const VoiceBulkAdd = ({ onClose }) => {
  const { user } = useAuth();
  const { activeShopId } = useShop();
  const rec = useAudioRecorder();

  const [step, setStep] = useState('input'); // 'input' | 'review'
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parse = async ({ useAudio }) => {
    setBusy(true);
    setError('');
    try {
      const res = await parseBulkItems({
        text: useAudio ? '' : text,
        audioBlob: useAudio ? rec.blob : null,
      });
      setRows(res.items.map((r) => ({ ...r, pricePaid: r.pricePaid ?? '' })));
      setNote(
        res.note ||
          (res.items.length
            ? ''
            : 'Didn’t catch any items — try again (start with the item name), or add rows manually below.')
      );
      setStep('review');
    } catch (err) {
      setError(err.message || 'Could not read that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (i, patch) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const addRow = () => setRows((rs) => [...rs, { name: '', pricePaid: '', source: '' }]);

  const commit = async () => {
    const clean = rows.filter((r) => r.name.trim());
    if (!clean.length) return;
    setBusy(true);
    try {
      // Sequential keeps it simple and shows progress; the list is short.
      for (const r of clean) {
        await addItem(activeShopId, user.uid, {
          name: r.name.trim(),
          pricePaid: toNumberOrNull(r.pricePaid),
          acquiredFrom: r.source?.trim() || '',
          photos: [],
        });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Bulk add by voice" onClose={onClose} wide>
      {!AI_ENABLED && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Preview.</strong> The AI isn’t connected yet — this is the layout for
          your feedback. Recording and editing work; parsing shows sample rows.
        </div>
      )}

      {step === 'input' ? (
        <div className="space-y-5">
          {/* Voice */}
          <div className="rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-sm font-medium text-slate-700">Talk it out</div>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
              e.g. “A Tom Brady rookie I paid 38 for at the card show, and a 1998
              Fossil first-edition Pikachu I got in a $3 booster pack.”
            </p>

            <div className="mt-4 flex flex-col items-center gap-3">
              {!rec.recording && !rec.blob && (
                <button
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl text-white shadow hover:bg-red-700 disabled:opacity-50"
                  onClick={rec.start}
                  disabled={!rec.supported}
                  title="Start recording"
                >
                  🎤
                </button>
              )}
              {rec.recording && (
                <button
                  className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-slate-900 text-2xl text-white shadow"
                  onClick={rec.stop}
                  title="Stop"
                >
                  ⏹️
                </button>
              )}
              {rec.recording && <div className="text-sm text-slate-500">Recording… {fmtTime(rec.seconds)}</div>}

              {rec.blob && !rec.recording && (
                <div className="flex w-full flex-col items-center gap-2">
                  <div className="text-xs text-emerald-600">Recorded {fmtTime(rec.seconds)} ✓</div>
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm" onClick={() => parse({ useAudio: true })} disabled={busy}>
                      {busy ? 'Reading…' : 'Parse recording'}
                    </button>
                    <button className="btn-secondary text-sm" onClick={rec.reset} disabled={busy}>
                      Re-record
                    </button>
                  </div>
                </div>
              )}
              {!rec.supported && (
                <div className="text-xs text-slate-400">Recording isn’t supported here — type below instead.</div>
              )}
              {rec.error && <div className="text-xs text-red-600">{rec.error}</div>}
            </div>
          </div>

          {/* Type / paste */}
          <div>
            <div className="label">…or type / paste it</div>
            <textarea
              className="field"
              rows={4}
              placeholder="One per line, or just talk in a paragraph — name and price if you know it."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              className="btn-primary mt-2 w-full text-sm"
              onClick={() => parse({ useAudio: false })}
              disabled={busy || !text.trim()}
            >
              {busy ? 'Reading…' : 'Parse text'}
            </button>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      ) : (
        <div className="space-y-4">
          {note && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{note}</div>}
          <div className="text-sm text-slate-600">
            Review before adding — edit names, add prices, drop anything wrong.
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                <input
                  className="field flex-1"
                  placeholder="Item name"
                  value={r.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                />
                <div className="relative w-24">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <input
                    className="field pl-5"
                    placeholder="Paid"
                    inputMode="decimal"
                    value={r.pricePaid}
                    onChange={(e) => updateRow(i, { pricePaid: e.target.value })}
                  />
                </div>
                <button
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  onClick={() => removeRow(i)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="text-sm font-medium text-sky-600 hover:text-sky-700" onClick={addRow}>
              + Add a row
            </button>
          </div>

          <div className="flex gap-2 border-t border-slate-200 pt-4">
            <button className="btn-primary flex-1" onClick={commit} disabled={busy || !rows.some((r) => r.name.trim())}>
              {busy ? 'Adding…' : `Add ${rows.filter((r) => r.name.trim()).length} item${rows.filter((r) => r.name.trim()).length === 1 ? '' : 's'}`}
            </button>
            <button className="btn-secondary" onClick={() => setStep('input')} disabled={busy}>
              Back
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default VoiceBulkAdd;
