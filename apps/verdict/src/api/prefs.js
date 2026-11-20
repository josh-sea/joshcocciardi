import { doc, onSnapshot, setDoc, deleteField, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

const prefsRef = (uid) => doc(db, 'verdict_users', uid, 'private', 'prefs');

export function watchPrefs(uid, cb) {
  return onSnapshot(prefsRef(uid), (s) => {
    const d = s.exists() ? s.data() : {};
    cb({ starred: d.starred || {}, muted: d.muted || {} });
  }, () => cb({ starred: {}, muted: {} }));
}

// Star and mute are exclusive: starring someone unmutes them and back.
export function setFriendPref(uid, friendUid, pref) {
  const patch = {
    starred: { [friendUid]: pref === 'starred' ? true : deleteField() },
    muted: { [friendUid]: pref === 'muted' ? true : deleteField() },
  };
  return setDoc(prefsRef(uid), patch, { merge: true });
}

export const savePushToken = (uid, token) =>
  setDoc(doc(db, 'verdict_users', uid, 'private', 'push'), { tokens: arrayUnion(token) }, { merge: true });

export const setPushEnabled = (uid, enabled) =>
  setDoc(doc(db, 'verdict_users', uid, 'private', 'push'), { enabled }, { merge: true });
