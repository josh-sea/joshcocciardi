import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { EzUser } from '@shared/types';
import { auth, db, USERS } from './firebase';
import { api } from './api';

interface AuthState {
  user: User | null;
  profile: EzUser | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ user: null, profile: null, loading: true, error: null, signOut: async () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<EzUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthReady(true);
    if (!u) {
      setProfile(null);
      setProfileReady(true);
    }
  }), []);

  useEffect(() => {
    if (!user) return;
    setProfileReady(false);
    let unsub = () => {};
    let cancelled = false;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    api.ensureAccount({ timezone: tz })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => {
        if (cancelled) return;
        unsub = onSnapshot(
          doc(db, USERS, user.uid),
          (snap) => {
            setProfile(snap.exists() ? (snap.data() as EzUser) : null);
            setProfileReady(true);
          },
          (e) => {
            setError(e.message);
            setProfileReady(true);
          },
        );
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  const value: AuthState = {
    user,
    profile,
    loading: !authReady || (!!user && !profileReady),
    error,
    signOut: () => signOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** The signed-in owner's profile; only use under <RequireProfile>. */
export function useProfile(): { uid: string; profile: EzUser } {
  const { user, profile } = useAuth();
  return { uid: user!.uid, profile: profile! };
}
