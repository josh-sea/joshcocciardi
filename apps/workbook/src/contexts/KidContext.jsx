import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { listKids } from '../services/kids.service';

// Tracks which kid is "active" — whose workbook we're capturing into and
// reading from. Persisted per-adult in localStorage so handing the tablet to
// Bodhi drops straight back into his shelf.
const KidContext = createContext({});

export const useKid = () => useContext(KidContext);

const storageKey = (uid) => `workbook.activeKid.${uid}`;

export const KidProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [kids, setKids] = useState([]);
  const [activeKidId, setActiveKidId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!currentUser) { setKids([]); setLoading(false); return; }
    setLoading(true);
    const list = await listKids(currentUser.uid);
    setKids(list);
    setLoading(false);
    return list;
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser) { setKids([]); setActiveKidId(null); setLoading(false); return; }
      setLoading(true);
      const list = await listKids(currentUser.uid);
      if (cancelled) return;
      setKids(list);
      const saved = localStorage.getItem(storageKey(currentUser.uid));
      const valid = list.find((k) => k.id === saved) ? saved : (list[0]?.id || null);
      setActiveKidId(valid);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const selectKid = useCallback((kidId) => {
    setActiveKidId(kidId);
    if (currentUser && kidId) localStorage.setItem(storageKey(currentUser.uid), kidId);
  }, [currentUser]);

  const activeKid = kids.find((k) => k.id === activeKidId) || null;

  return (
    <KidContext.Provider value={{ kids, activeKid, activeKidId, loading, selectKid, refresh, setKids }}>
      {children}
    </KidContext.Provider>
  );
};
