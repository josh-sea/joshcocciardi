import React, { useCallback, useEffect, useRef, useState } from "react";
import AuthScreen from "./AuthScreen";
import Editor from "./Editor";
import Picker from "./Picker";
import CSS from "./styles";
import { signOutOfMise, watchAuth } from "./auth";
import {
  createImplementation,
  deleteImplementation,
  renameImplementation,
  watchImplementation,
  watchImplementations,
} from "./store";

/* Remember which plan was open so a reload drops you back into it rather than
   the picker. Per-uid so a shared browser doesn't leak one user's last plan
   into another's session. */
const lastKey = (uid) => `mise:lastImpl:${uid}`;
const readLast = (uid) => {
  try {
    return window.localStorage.getItem(lastKey(uid));
  } catch {
    return null;
  }
};
const writeLast = (uid, id) => {
  try {
    if (id) window.localStorage.setItem(lastKey(uid), id);
    else window.localStorage.removeItem(lastKey(uid));
  } catch {
    /* private mode — the picker still works, it just won't resume */
  }
};

const Splash = ({ children }) => <div className="center">{children}</div>;

export default function Mise() {
  const [user, setUser] = useState(undefined); // undefined while auth resolves
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [openDoc, setOpenDoc] = useState(undefined); // undefined loading, null gone
  const restoredRef = useRef(false);

  useEffect(() => watchAuth((u) => setUser(u || null)), []);

  // The signed-in user's plans. Resuming the last-open plan happens here, on
  // the first snapshot, rather than in an effect of its own — an effect would
  // have to read "has the list arrived yet" out of a render snapshot that is
  // still stale on the tick auth resolves, and would resume against an empty
  // list.
  useEffect(() => {
    restoredRef.current = false;
    if (!user) {
      setRows([]);
      setListLoading(false);
      return undefined;
    }
    setListLoading(true);
    setListError(null);
    return watchImplementations(
      user.uid,
      (next) => {
        setRows(next);
        setListLoading(false);
        if (!restoredRef.current) {
          restoredRef.current = true;
          const last = readLast(user.uid);
          if (last && next.some((r) => r.id === last)) setOpenId(last);
        }
      },
      (e) => {
        console.error("[mise] list failed:", e);
        setListError(
          e.code === "permission-denied"
            ? "Firestore rules are blocking this account. Deploy the Mise rules (./deploy.sh firestore) and reload."
            : e.message
        );
        setListLoading(false);
      }
    );
  }, [user]);

  // The open plan, live.
  useEffect(() => {
    if (!openId) {
      setOpenDoc(undefined);
      return undefined;
    }
    setOpenDoc(undefined);
    return watchImplementation(
      openId,
      (d) => setOpenDoc(d),
      (e) => {
        console.error("[mise] open failed:", e);
        setOpenDoc(null);
      }
    );
  }, [openId]);

  // A plan deleted here or elsewhere sends you back to the shelf.
  useEffect(() => {
    if (openId && openDoc === null) {
      setOpenId(null);
      if (user) writeLast(user.uid, null);
    }
  }, [openId, openDoc, user]);

  const open = useCallback(
    (id) => {
      setOpenId(id);
      if (user) writeLast(user.uid, id);
    },
    [user]
  );

  const exit = useCallback(() => {
    setOpenId(null);
    if (user) writeLast(user.uid, null);
  }, [user]);

  const create = useCallback(
    async (payload) => {
      const id = await createImplementation(user.uid, payload);
      open(id);
    },
    [user, open]
  );

  const remove = useCallback(
    async (id) => {
      try {
        await deleteImplementation(id);
        if (openId === id) exit();
      } catch (e) {
        console.error("[mise] delete failed:", e);
        setListError(e.message);
      }
    },
    [openId, exit]
  );

  const rename = useCallback(async () => {
    if (!openDoc) return;
    const next = window.prompt("Name this implementation", openDoc.name);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === openDoc.name) return;
    try {
      await renameImplementation(openDoc.id, { name, client: openDoc.client });
    } catch (e) {
      console.error("[mise] rename failed:", e);
    }
  }, [openDoc]);

  const signOut = useCallback(async () => {
    setOpenId(null);
    await signOutOfMise();
  }, []);

  let body;
  if (user === undefined) {
    body = <Splash>checking your session…</Splash>;
  } else if (!user) {
    body = <AuthScreen />;
  } else if (openId && openDoc === undefined) {
    body = <Splash>opening…</Splash>;
  } else if (openId && openDoc) {
    body = (
      <Editor
        key={openDoc.id}
        user={user}
        impl={openDoc}
        onExit={exit}
        onSignOut={signOut}
        onRename={rename}
      />
    );
  } else {
    body = (
      <Picker
        user={user}
        rows={rows}
        loading={listLoading}
        error={listError}
        onOpen={open}
        onCreate={create}
        onDelete={remove}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="mise">
      <style>{CSS}</style>
      {body}
    </div>
  );
}
