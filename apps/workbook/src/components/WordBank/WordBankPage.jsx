import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SIGHT_WORDS } from '../../utils/sightWords';
import { warmWord, speakWord } from '../../services/tts.service';

// Grown-up tool: generate audio once for the most common words so they're
// instant and free forever, for every child in every family. Also handy for
// pre-warming a specific list before a lesson.
const uniq = [...new Set(SIGHT_WORDS.map((w) => w.toLowerCase()))];

const WordBankPage = () => {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ cached: 0, generated: 0, skipped: 0 });
  const [extra, setExtra] = useState('');

  const warmList = async (list) => {
    setRunning(true);
    setDone(0);
    setStats({ cached: 0, generated: 0, skipped: 0 });
    let s = { cached: 0, generated: 0, skipped: 0 };
    for (let i = 0; i < list.length; i++) {
      const result = await warmWord(list[i]);
      s = { ...s, [result]: (s[result] || 0) + 1 };
      setStats(s);
      setDone(i + 1);
    }
    setRunning(false);
  };

  const warmExtra = () => {
    const list = extra.split(/[\s,]+/).map((w) => w.trim()).filter(Boolean);
    if (list.length) warmList(list);
  };

  const pct = uniq.length ? Math.round((done / uniq.length) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24 space-y-6">
      <div>
        <button onClick={() => navigate('/grownups')} className="text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-4">← Back</button>
        <h1 className="text-xl font-bold text-slate-900">Word Bank</h1>
        <p className="text-sm text-slate-500">
          {uniq.length} common words. Warming them stores each one’s audio in the shared cache so the
          first tap is instant — and it never costs a generation again.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <button className="btn-primary w-full" disabled={running} onClick={() => warmList(uniq)}>
          {running ? `Warming… ${done}/${uniq.length}` : `Warm up ${uniq.length} common words`}
        </button>
        {(running || done > 0) && (
          <>
            <div className="h-2 bg-slate-100 rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex gap-4 text-sm text-slate-600 mt-3">
              <span>✅ Ready: {stats.cached + stats.generated}</span>
              <span>✨ New: {stats.generated}</span>
              {stats.skipped > 0 && <span className="text-amber-600">⚠️ Skipped: {stats.skipped}</span>}
            </div>
            {stats.skipped > 0 && !running && (
              <p className="text-xs text-amber-600 mt-2">
                Some words couldn’t be generated (cloud voice may be offline or not enabled yet).
                They’ll still read aloud with the device voice.
              </p>
            )}
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <h2 className="font-semibold text-slate-800 mb-1">Warm specific words</h2>
        <p className="text-sm text-slate-500 mb-3">Paste tricky words from an upcoming lesson (space or comma separated).</p>
        <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="photosynthesis, equator, mammal" />
        <div className="flex gap-2 mt-2">
          <button className="btn-primary" disabled={running || !extra.trim()} onClick={warmExtra}>Warm these</button>
          <button className="btn-secondary" disabled={!extra.trim()} onClick={() => speakWord(extra.trim().split(/\s+/)[0])}>Test voice</button>
        </div>
      </section>
    </div>
  );
};

export default WordBankPage;
