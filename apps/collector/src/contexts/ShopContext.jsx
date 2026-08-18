import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getUserShops } from '../services/shop.service';
import { subscribeShopItems } from '../services/items.service';

const ShopContext = createContext(null);

export const useShop = () => {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within a ShopProvider');
  return ctx;
};

const ACTIVE_KEY = 'collector.activeShopId';

export const ShopProvider = ({ children }) => {
  const { user } = useAuth();
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [activeShopId, setActiveShopIdState] = useState(
    () => localStorage.getItem(ACTIVE_KEY) || null
  );
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);

  const setActiveShopId = useCallback((id) => {
    setActiveShopIdState(id);
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  }, []);

  const refreshShops = useCallback(async () => {
    if (!user) return [];
    setShopsLoading(true);
    try {
      const list = await getUserShops(user.uid);
      setShops(list);
      return list;
    } finally {
      setShopsLoading(false);
    }
  }, [user]);

  // Load the user's shops on sign-in.
  useEffect(() => {
    if (!user) {
      setShops([]);
      setShopsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setShopsLoading(true);
      try {
        const list = await getUserShops(user.uid);
        if (cancelled) return;
        setShops(list);
      } finally {
        if (!cancelled) setShopsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Keep the active shop pointing at something valid.
  useEffect(() => {
    if (shopsLoading) return;
    if (shops.length === 0) {
      if (activeShopId) setActiveShopId(null);
      return;
    }
    const stillValid = shops.some((s) => s.id === activeShopId);
    if (!stillValid) setActiveShopId(shops[0].id);
  }, [shops, shopsLoading, activeShopId, setActiveShopId]);

  const activeShop = shops.find((s) => s.id === activeShopId) || null;

  // Live item stream for the active shop.
  useEffect(() => {
    if (!activeShopId) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    setItemsError(null);
    const unsub = subscribeShopItems(
      activeShopId,
      (list) => {
        setItems(list);
        setItemsLoading(false);
      },
      (err) => {
        console.error('Items subscription error:', err);
        setItemsError(err);
        setItemsLoading(false);
      }
    );
    return unsub;
  }, [activeShopId]);

  const value = {
    shops,
    shopsLoading,
    activeShop,
    activeShopId,
    setActiveShopId,
    refreshShops,
    items,
    itemsLoading,
    itemsError,
    needsSetup: !shopsLoading && shops.length === 0,
  };

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
};
