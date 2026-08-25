import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useKid } from '../../contexts/KidContext';
import { compressImage } from '../../utils/image';
import { readWorkbookPage } from '../../services/vision.service';
import { savePage } from '../../services/pages.service';

const KINDS = [
  ['heading', 'Title'],
  ['direction', 'Directions'],
  ['question', 'Question'],
  ['passage', 'Reading'],
  ['example', 'Example'],
  ['choice', 'Answer choice'],
  ['other', 'Other'],
];

// Snap or pick a workbook page → AI reads it → grown-up reviews the text →
// save it to the child's shelf. The child does the actual work on paper; this
// just makes the words on the page tappable and hearable.
const CapturePage = () => {
  const { currentUser } = useAuth();
  const { activeKid, activeKidId } = useKid();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | reading | review | saving
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onPick = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!picked) return;
    setError('');
    setPhase('reading');
    try {
      const compressed = await compressImage(picked);
      setFile(compressed);
      const url = URL.createObjectURL(compressed);
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });

      const { title: t, blocks: b } = await readWorkbookPage(compressed);
      setTitle(t);
      setBlocks(b);
      setPhase('review');
    } catch (err) {
      setError(err.message || 'Something went wrong reading that page.');
      setPhase(file ? 'review' : 'idle');
    }
  };

  const updateBlock = (i, patch) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeBlock = (i) => setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  const addBlock = () =>
    setBlocks((bs) => [...bs, { kind: 'question', number: '', text: '' }]);

  const onSave = async () => {
    const cleaned = blocks.map((b) => ({ ...b, text: b.text.trim() })).filter((b) => b.text);
    if (!cleaned.length) { setError('Add at least one line of text before saving.'); return; }
    setPhase('saving');
    setError('');
    try {
      const pageId = await savePage(currentUser.uid, activeKidId, {
        title: title.trim() || 'Workbook page',
        blocks: cleaned,
        imageFile: file,
      });
      navigate(`/read/${pageId}`);
    } catch (err) {
      setError(err.message || 'Could not save the page.');
      setPhase('review');
    }
  };

  if (!activeKid) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-slate-600">
        <p className="mb-4">First add a child to save pages for.</p>
        <button className="btn-primary" onClick={() => navigate('/grownups')}>Add a child</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Add a page for {activeKid.name}</h1>
      <p className="text-slate-500 text-sm mb-5">Take a straight-on photo of the workbook page, or choose one from your device.</p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />

      {phase === 'idle' && !previewUrl && (
        <button className="btn-primary w-full py-6 text-lg" onClick={() => fileRef.current?.click()}>
          📷 Take / choose a photo
        </button>
      )}

      {error && (
        <div className="my-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
      )}

      {previewUrl && (
        <img src={previewUrl} alt="Workbook page" className="w-full rounded-2xl border border-slate-200 mb-4" />
      )}

      {phase === 'reading' && (
        <div className="flex items-center gap-3 justify-center py-6 text-indigo-600 font-semibold">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reading the page…
        </div>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <div className="space-y-4">
          <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()}>
            📷 Retake photo
          </button>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Page title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Workbook page" />
          </div>

          <p className="text-xs text-slate-500">
            Check the AI got the words right, then save. Tap ✕ to drop a line that isn’t part of the page.
          </p>

          {blocks.map((b, i) => (
            <div key={i} className="border border-slate-200 rounded-2xl p-3 space-y-2 bg-white">
              <div className="flex items-center gap-2">
                <select value={b.kind} onChange={(e) => updateBlock(i, { kind: e.target.value })}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-slate-50">
                  {KINDS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
                <input value={b.number} onChange={(e) => updateBlock(i, { number: e.target.value })}
                  className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1" placeholder="#" />
                <button onClick={() => removeBlock(i)} className="ml-auto text-slate-400 hover:text-red-600 text-lg px-2" aria-label="Remove line">✕</button>
              </div>
              <textarea value={b.text} onChange={(e) => updateBlock(i, { text: e.target.value })}
                rows={Math.max(2, Math.ceil(b.text.length / 48))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 resize-y" />
            </div>
          ))}

          <button onClick={addBlock} className="btn-secondary w-full">+ Add a line</button>

          <button onClick={onSave} disabled={phase === 'saving'} className="btn-primary w-full py-4 text-lg">
            {phase === 'saving' ? 'Saving…' : `Save to ${activeKid.name}’s shelf`}
          </button>
        </div>
      )}
    </div>
  );
};

export default CapturePage;
