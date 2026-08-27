import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useKid } from '../../contexts/KidContext';
import { addKid, deleteKid } from '../../services/kids.service';

// The one grown-up screen: manage kids, warm up common words, sign out.
const GrownupsPage = () => {
  const { currentUser, logout } = useAuth();
  const { kids, activeKidId, selectKid, refresh, setKids } = useKid();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onAdd = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const kid = await addKid(currentUser.uid, name);
      setName('');
      const list = await refresh();
      selectKid(kid.id);
      if (!list) setKids((k) => [...k, kid]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (kid) => {
    if (!window.confirm(`Remove ${kid.name}? Their saved pages will no longer show.`)) return;
    await deleteKid(currentUser.uid, kid.id);
    await refresh();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24 space-y-8">
      <div>
        <button onClick={() => navigate('/')} className="text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-4">← Back</button>
        <h1 className="text-xl font-bold text-slate-900">Grown-up settings</h1>
        <p className="text-sm text-slate-500">Signed in as {currentUser?.email}</p>
      </div>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Children</h2>
        <div className="space-y-2">
          {kids.map((kid) => (
            <div key={kid.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${kid.id === activeKidId ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
              <button onClick={() => { selectKid(kid.id); navigate('/'); }} className="flex-1 text-left font-semibold text-slate-800">
                {kid.name}
                {kid.id === activeKidId && <span className="ml-2 text-xs text-indigo-600 font-medium">active</span>}
              </button>
              <button onClick={() => onDelete(kid)} className="text-slate-400 hover:text-red-600 text-sm" aria-label={`Remove ${kid.name}`}>Remove</button>
            </div>
          ))}
          {!kids.length && <p className="text-sm text-slate-400">No children yet.</p>}
        </div>

        <form onSubmit={onAdd} className="flex gap-2 mt-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Child’s name (e.g. Bodhi)"
            className="flex-1 px-4 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400" />
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary">Add</button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </section>

      <section>
        <h2 className="font-semibold text-slate-800 mb-2">Words</h2>
        <p className="text-sm text-slate-500 mb-3">
          Warm up the most common words so they play instantly for every child — done once, shared by everyone.
        </p>
        <button className="btn-secondary" onClick={() => navigate('/words')}>Open Word Bank</button>
      </section>

      <section>
        <button className="btn-secondary" onClick={async () => { await logout(); navigate('/login'); }}>Sign out</button>
      </section>
    </div>
  );
};

export default GrownupsPage;
