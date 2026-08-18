import { useState } from 'react';
import { identifyFromPhoto, AI_ENABLED } from '../../services/ai.service';
import { percent } from '../../utils/format';

// "Identify with AI" for the item editor. Runs on the cover photo, shows a few
// candidate matches with confidence, and applies the one you pick to the form.
// In preview mode it returns sample candidates so you can see the layout.
const PhotoIdentify = ({ photoUrl, onApply }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const res = await identifyFromPhoto(photoUrl);
      setCandidates(res.candidates || []);
      setNote(res.note || '');
    } catch (err) {
      setError(err.message || 'Could not identify that photo. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const summary = (c) =>
    [c.category, c.sport, c.league, c.itemType, c.graded ? `${c.gradingCompany} ${c.grade}`.trim() : null]
      .filter(Boolean)
      .join(' · ');

  return (
    <div>
      <button
        type="button"
        onClick={run}
        className="btn-secondary w-full text-sm"
        disabled={!photoUrl || loading}
        title={photoUrl ? 'Identify this item from its cover photo' : 'Add a photo first'}
      >
        ✨ {loading ? 'Identifying…' : 'Identify with AI'}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 p-2">
          {!AI_ENABLED && (
            <div className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Preview — sample matches. Real version reads your photo with Gemini.
            </div>
          )}
          {loading ? (
            <div className="py-4 text-center text-sm text-slate-400">Looking at the photo…</div>
          ) : error ? (
            <div className="py-2 text-center text-sm text-red-600">{error}</div>
          ) : candidates.length === 0 ? (
            <div className="py-2 text-center text-sm text-slate-400">No matches found.</div>
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
