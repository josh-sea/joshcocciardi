/* ------------------------------------------------------------------ */
/*  Sunday Desk: the ESPN connection                                   */
/*                                                                     */
/*  draftnight_espn/{uid}                                              */
/*    leagueId, teamId, season, espnS2, swid, updatedAt                */
/*                                                                     */
/*  Document id is the uid, so there is no query shape that could ever */
/*  return another user's row.                                         */
/*                                                                     */
/*  espnS2 and swid are full ESPN account session cookies. Storing them */
/*  is what makes the tool work on a phone, where there is no way to    */
/*  pull cookies out of Safari. Anyone who would rather not store them  */
/*  can keep them on the device instead — see creds.js — at the cost of */
/*  re-entering them per device.                                        */
/* ------------------------------------------------------------------ */

import { deleteField, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

const COL = "draftnight_espn";
const ref = (uid) => doc(db, COL, uid);

const shape = (snap) => {
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  return {
    leagueId: d.leagueId || "",
    teamId: d.teamId || "",
    season: d.season || new Date().getFullYear(),
    // Presence only. The values are read back for editing, but the UI never
    // displays them in full.
    espnS2: d.espnS2 || "",
    swid: d.swid || "",
    hasStoredCreds: Boolean(d.espnS2 && d.swid),
    updatedAt: d.updatedAt?.toDate?.() || null,
  };
};

export const watchConnection = (uid, cb, onError) =>
  onSnapshot(ref(uid), (snap) => cb(shape(snap)), onError);

export const readConnection = async (uid) => shape(await getDoc(ref(uid)));

export const saveLeague = (uid, { leagueId, teamId, season }) =>
  setDoc(
    ref(uid),
    {
      leagueId: String(leagueId).trim(),
      teamId: String(teamId).trim(),
      season: Number(season),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

export const saveCreds = (uid, { espnS2, swid }) =>
  setDoc(
    ref(uid),
    { espnS2: String(espnS2).trim(), swid: String(swid).trim(), updatedAt: serverTimestamp() },
    { merge: true }
  );

/* Remove the cookies but keep the league ids, so "disconnect" doesn't make you
   retype everything to reconnect. */
export const clearCreds = (uid) =>
  setDoc(
    ref(uid),
    { espnS2: deleteField(), swid: deleteField(), updatedAt: serverTimestamp() },
    { merge: true }
  );
