import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useShop } from '../../contexts/ShopContext';
import ShopMenu from '../Shop/ShopMenu';

const Header = () => {
  const { user } = useAuth();
  const { activeShop } = useShop();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-xl">🗃️</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {activeShop ? activeShop.name : 'Collector Shop'}
              </div>
              {activeShop && (
                <div className="truncate text-xs text-slate-400">
                  {activeShop.memberUids?.length || 1} member
                  {(activeShop.memberUids?.length || 1) > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white"
            title="Shop & account"
          >
            {(user?.email?.[0] || '?').toUpperCase()}
          </button>
        </div>
      </header>
      {menuOpen && <ShopMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
};

export default Header;
