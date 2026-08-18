import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useShop } from '../../contexts/ShopContext';
import { createShop, joinShopByCode } from '../../services/shop.service';
import Modal from '../Layout/Modal';

// The shop + account sheet: switch shops, copy the invite code, add/join a
// shop, and sign out.
const ShopMenu = ({ onClose }) => {
  const { user, profile, logout } = useAuth();
  const { shops, activeShop, activeShopId, setActiveShopId, refreshShops } = useShop();
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(null); // 'create' | 'join' | null
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copyCode = async () => {
    if (!activeShop?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(activeShop.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is visible regardless.
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError('');
    try {
      const shop = await createShop(user, name || 'New Shop', profile);
      await refreshShops();
      setActiveShopId(shop.id);
      setAdding(null);
      setName('');
    } catch {
      setError('Could not create the shop.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    setError('');
    try {
      const shopId = await joinShopByCode(user, code, profile);
      await refreshShops();
      setActiveShopId(shopId);
      setAdding(null);
      setCode('');
    } catch (err) {
      setError(err.message || 'Could not join with that code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Shop & account" onClose={onClose}>
      <div className="space-y-5">
        {/* Invite code for the active shop */}
        {activeShop && (
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Invite code — {activeShop.name}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="text-lg font-bold tracking-widest text-slate-900">
                {activeShop.inviteCode}
              </code>
              <button className="btn-secondary px-3 py-1.5 text-sm" onClick={copyCode}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Share this so someone else can join and edit this same collection.
            </p>
          </div>
        )}

        {/* Shop switcher */}
        {shops.length > 1 && (
          <div>
            <div className="label">Your shops</div>
            <div className="space-y-1">
              {shops.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setActiveShopId(s.id); onClose(); }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                    s.id === activeShopId
                      ? 'border-sky-300 bg-sky-50 text-sky-800'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  {s.id === activeShopId && <span className="text-xs">Active</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add / join */}
        {adding === null ? (
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 text-sm" onClick={() => setAdding('create')}>
              + New shop
            </button>
            <button className="btn-secondary flex-1 text-sm" onClick={() => setAdding('join')}>
              Join with code
            </button>
          </div>
        ) : adding === 'create' ? (
          <div className="space-y-2">
            <input
              className="field"
              placeholder="Shop name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1 text-sm" onClick={handleCreate} disabled={busy}>
                Create
              </button>
              <button className="btn-secondary text-sm" onClick={() => setAdding(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className="field uppercase tracking-widest"
              placeholder="Invite code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={busy}
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1 text-sm" onClick={handleJoin} disabled={busy}>
                Join
              </button>
              <button className="btn-secondary text-sm" onClick={() => setAdding(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 text-xs text-slate-400">
            Signed in as {profile?.displayName || user?.email}
          </div>
          <button className="btn-danger w-full text-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ShopMenu;
