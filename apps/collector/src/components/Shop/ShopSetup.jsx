import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useShop } from '../../contexts/ShopContext';
import { createShop, joinShopByCode } from '../../services/shop.service';

// Shown when a signed-in user isn't a member of any shop yet. They can spin up
// a new shop or join an existing one with an invite code. This is what makes
// the shop shared: Joe creates it, hands Lindsey the code, both work the same
// inventory.
const ShopSetup = () => {
  const { user, profile } = useAuth();
  const { refreshShops, setActiveShopId } = useShop();
  const [mode, setMode] = useState('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const shop = await createShop(user, name || 'Our Collection', profile);
      await refreshShops();
      setActiveShopId(shop.id);
    } catch (err) {
      console.error(err);
      setError('Could not create the shop. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const shopId = await joinShopByCode(user, code, profile);
      await refreshShops();
      setActiveShopId(shopId);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not join with that code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-6">
        <h1 className="text-xl font-bold text-slate-900">Set up your shop</h1>
        <p className="mt-1 text-sm text-slate-500">
          A shop is your shared collection. Create one, then invite the other
          person with the code it gives you — you&apos;ll both see the same inventory.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            className={`rounded-md py-2 text-sm font-medium ${mode === 'create' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            onClick={() => { setMode('create'); setError(''); }}
          >
            Create a shop
          </button>
          <button
            className={`rounded-md py-2 text-sm font-medium ${mode === 'join' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            onClick={() => { setMode('join'); setError(''); }}
          >
            Join with a code
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {mode === 'create' ? (
          <form onSubmit={handleCreate} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="shopName">Shop name</label>
              <input
                id="shopName"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Joe & Lindsey's Collection"
                disabled={busy}
              />
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Creating…' : 'Create shop'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="joinCode">Invite code</label>
              <input
                id="joinCode"
                className="field uppercase tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                disabled={busy}
              />
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Joining…' : 'Join shop'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ShopSetup;
