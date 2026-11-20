import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { auth } from '../firebase';
import { userRef, createProfile } from '../api/profile';
import { watchPrefs } from '../api/prefs';
import { watchConnections, getPublicProfile } from '../api/social';
import { watchMyRatings } from '../api/ratings';
import { watchMyLists } from '../api/lists';

const Ctx = createContext(null);

// Everything most screens need about the signed-in person: their profile,
// star/mute prefs, connections (with names), and their own ratings and lists.
export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(undefined);
  const [prefs, setPrefs] = useState({ starred: {}, muted: {} });
  const [connections, setConnections] = useState([]);
  const [people, setPeople] = useState({}); // uid → public profile
  const [myRatings, setMyRatings] = useState([]);
  const [myLists, setMyLists] = useState([]);
  const [pendingInvite, setPendingInvite] = useState(null);
  const creating = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u || null);
    if (!u) {
      setProfile(null);
      setConnections([]);
      setMyRatings([]);
      setMyLists([]);
      setPrefs({ starred: {}, muted: {} });
    }
  }), []);

  useEffect(() => {
    if (!user) return undefined;
    setProfile(undefined);
    return onSnapshot(userRef(user.uid), async (snap) => {
      if (snap.exists()) {
        setProfile({ uid: user.uid, ...snap.data() });
      } else if (!creating.current) {
        // First sign-in (or the account was deleted): start a fresh profile.
        creating.current = true;
        try { await createProfile(user.uid); } finally { creating.current = false; }
      }
    }, () => setProfile(null));
  }, [user]);

  const ready = Boolean(user && profile && profile.username);

  useEffect(() => {
    if (!ready) return undefined;
    const subs = [
      watchPrefs(user.uid, setPrefs),
      watchConnections(user.uid, setConnections, () => setConnections([])),
      watchMyRatings(user.uid, setMyRatings),
      watchMyLists(user.uid, setMyLists),
    ];
    return () => subs.forEach((u) => u());
  }, [ready, user]);

  // Fetch names for everyone I'm connected to (once each).
  useEffect(() => {
    if (!user) return;
    const missing = connections
      .map((c) => c.users.find((u) => u !== user.uid))
      .filter((uid) => uid && !people[uid]);
    if (!missing.length) return;
    Promise.all(missing.map((uid) => getPublicProfile(uid).catch(() => null))).then((list) => {
      setPeople((prev) => {
        const next = { ...prev };
        list.forEach((p, i) => { next[missing[i]] = p || { uid: missing[i], displayName: 'Deleted account', username: '' }; });
        return next;
      });
    });
  }, [connections, user, people]);

  const value = useMemo(() => {
    const me = user ? user.uid : null;
    const other = (c) => c.users.find((u) => u !== me);
    const friends = connections.filter((c) => c.status === 'accepted').map(other);
    const incoming = connections.filter((c) => c.status === 'pending' && c.requestedBy !== me).map(other);
    const outgoing = connections.filter((c) => c.status === 'pending' && c.requestedBy === me).map(other);
    const ratingByKey = Object.fromEntries(myRatings.map((r) => [r.titleKey, r]));
    const listByKey = Object.fromEntries(myLists.map((l) => [l.titleKey, l]));
    const stateOf = (uid) => {
      if (friends.includes(uid)) return 'friends';
      if (incoming.includes(uid)) return 'pending_in';
      if (outgoing.includes(uid)) return 'pending_out';
      return 'none';
    };
    const person = (uid) => people[uid] || { uid, displayName: '…', username: '' };
    const prefOf = (uid) => (prefs.starred[uid] ? 'starred' : prefs.muted[uid] ? 'muted' : 'normal');
    return {
      user, profile, ready, prefs, connections, friends, incoming, outgoing,
      people, person, rememberPerson: (p) => p && setPeople((prev) => ({ ...prev, [p.uid]: { ...prev[p.uid], ...p } })),
      stateOf, prefOf, myRatings, myLists, ratingByKey, listByKey,
      pendingInvite, setPendingInvite,
    };
  }, [user, profile, ready, prefs, connections, people, myRatings, myLists, pendingInvite]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
