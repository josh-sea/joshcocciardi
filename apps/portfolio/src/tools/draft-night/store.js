/* ------------------------------------------------------------------ */
/*  Draft Night: Firestore persistence                                 */
/*                                                                     */
/*  draftnight_leagues/{leagueId}                                      */
/*    ownerUid, name, preset, teams, seat, slots, scoring,             */
/*    gone[], mine[], createdAt, updatedAt                             */
/*                                                                     */
/*  Config and draft state live in one document on purpose. A draft is */
/*  a couple hundred short strings at its very largest, it is always   */
/*  read whole, and one document means a pick and the league it        */
/*  belongs to can never disagree with each other.                     */
/* ------------------------------------------------------------------ */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeConfig } from "./league";
import { BY_NAME } from "./data";

const COL = "draftnight_leagues";
const leagueCol = () => collection(db, COL);
const leagueDoc = (id) => doc(db, COL, id);

// Names are the join key into the static player board, so a name that isn't on
// the board is dropped rather than rendered as a ghost row.
const cleanNames = (list) =>
  Array.isArray(list) ? list.filter((n) => typeof n === "string" && BY_NAME[n]) : [];

const shape = (snap) => {
  const d = snap.data();
  return {
    id: snap.id,
    ownerUid: d.ownerUid,
    name: d.name || "Untitled league",
    preset: d.preset || "custom",
    config: normalizeConfig({ teams: d.teams, seat: d.seat, slots: d.slots, scoring: d.scoring }),
    gone: cleanNames(d.gone),
    mine: cleanNames(d.mine),
    createdAt: d.createdAt?.toDate?.() || null,
    updatedAt: d.updatedAt?.toDate?.() || null,
  };
};

/* Live list of the signed-in user's leagues. Sorted client-side so the
   collection needs no composite index. */
export const watchLeagues = (ownerUid, cb, onError) =>
  onSnapshot(
    query(leagueCol(), where("ownerUid", "==", ownerUid)),
    (snap) => {
      const rows = snap.docs.map(shape);
      rows.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
      cb(rows);
    },
    onError
  );

export const watchLeague = (id, cb, onError) =>
  onSnapshot(leagueDoc(id), (snap) => cb(snap.exists() ? shape(snap) : null), onError);

export const createLeague = async (ownerUid, { name, preset, config, gone, mine }) => {
  const cfg = normalizeConfig(config);
  const ref = await addDoc(leagueCol(), {
    ownerUid,
    name: name || "My league",
    preset: preset || "custom",
    teams: cfg.teams,
    seat: cfg.seat,
    slots: cfg.slots,
    scoring: cfg.scoring,
    gone: cleanNames(gone),
    mine: cleanNames(mine),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

/* The draft state write. Fires on every strike and every pick, so it stays a
   two-field update rather than a whole-document rewrite. */
export const saveDraft = (id, { gone, mine }) =>
  updateDoc(leagueDoc(id), {
    gone: cleanNames(gone),
    mine: cleanNames(mine),
    updatedAt: serverTimestamp(),
  });

export const saveSettings = (id, { name, preset, config }) => {
  const cfg = normalizeConfig(config);
  return updateDoc(leagueDoc(id), {
    name: name || "My league",
    preset: preset || "custom",
    teams: cfg.teams,
    seat: cfg.seat,
    slots: cfg.slots,
    scoring: cfg.scoring,
    updatedAt: serverTimestamp(),
  });
};

export const deleteLeague = (id) => deleteDoc(leagueDoc(id));
