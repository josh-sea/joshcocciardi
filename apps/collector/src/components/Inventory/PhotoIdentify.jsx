import { useRef, useState } from 'react';
import { identifyFromPhoto, AI_ENABLED } from '../../services/ai.service';
import { percent } from '../../utils/format';

// "Identify with AI" — take or choose a photo of the item and let Gemini
// propose what it is, then apply the pick to the form.
//
// It runs on the freshly selected File (sent straight to the model), NOT on an
// already-uploaded Storage URL. Fetching a Storage download URL cross-origin is
// blocked by CORS (Safari reports "Load failed"), so going straight from the
// File sidesteps that entirely and works on mobile with no bucket config.
const PhotoIdentify = ({ onApply, currentFile }) => {
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const identify = async (file) => {
    if (!file) return;
    setOpen(true);
    setLoading(true);
    setError('');
    setCandidates([]);
    try {
      const res = await identifyFromPhoto(file);
      setCandidates(res.candidates || []);
      setNote(res.note || '');
    } catch (err) {
      setError(err.message || 'Could not identify that photo. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    identify(file);
  };

  // If a photo was added this session, identify from it directly; otherwise the
  // button opens the camera/library picker.
  const onMainClick = () => (currentFile ? identify(currentFile) : inputRef.current?.click());

  const summary = (c) =>
    [c.category, c.sport, c.league, c.itemType, c.graded ? `${c.gradingCompany} ${c.grade}`.trim() : null]
      .filter(Boolean)
      .join(' · ');

  return (
    <div>
      <button
        type="button"
        onClick={onMainClick}
        className="btn-secondary w-full text-sm"
        disabled={loading}
      >
        ✨ {loading
          ? 'Identifying…'
          : currentFile
            ? 'Identify with AI (uses your photo)'
            : 'Identify with AI — take or choose a photo'}
      </button>
      {currentFile && !loading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1 w-full text-center text-[11px] font-medium text-sky-600 hover:text-sky-700"
        >
          use a different photo
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 p-2">
          {!AI_ENABLED && (
            <div className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Preview — sample matches.
            </div>
          )}
          {loading ? (
            <div className="py-4 text-center text-sm text-slate-400">Looking at the photo…</div>
          ) : error ? (
            <div className="py-2 text-center text-sm text-red-600">{error}</div>
          ) : candidates.length === 0 ? (
            <div className="py-3 text-center text-sm text-slate-400">
              No confident match. Try a clearer, straight-on photo of the front.
            </div>
          ) : (
            <>
              {note && <div className="mb-2 px-1 text-[11px] text-slate-400">{note}</div>}
              <div className="space-y-1.5">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onApply(c); setOpen(false); }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-left hover:border-sky-300 hover:bg-sky-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{c.label || c.name}</div>
                      {summary(c) && <div className="truncate text-xs text-slate-500">{summary(c)}</div>}
                    </div>
                    {c.confidence != null && (
                      <span className="chip shrink-0 bg-slate-100 text-slate-500">{percent(c.confidence * 100)}</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-2 px-1 text-[11px] text-slate-400">
                Picking one fills in the fields it’s confident about — you can still edit everything.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PhotoIdentify;
