import { useEffect, useState } from "react";
import { royRef } from "../admin/firebaseConfig";
import { onValue } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EMOTE_PACKS } from "../utils/emoteData";
import { THEMES } from "../utils/themeData";
import { ANIMATIONS } from "../utils/animationData";

const CACHE_KEY = "roy_feature_flags_v2";

// Every unlockable is one flat switch at /roy/users/{uid}/features/{id}: true,
// so granting one by hand in the Firebase console is a single key. `all: true`
// unlocks everything (handy for testers). Only the server or the console can
// write here; the rules block clients.
export const GAME_FEATURES = ["unlimitedGames", "deathmatch", "strategist"];
const paidIds = (catalog) => Object.values(catalog).filter((item) => !item.free).map((item) => item.id);
export const PACK_FEATURES = {
  emotes: Object.keys(EMOTE_PACKS),
  themes: paidIds(THEMES),
  animations: paidIds(ANIMATIONS),
};

const defaultFlags = {
  unlimitedGames: false,
  deathmatch: false,
  strategist: false,
  emotes: {},
  themes: {},
  animations: {},
};

// Turns the flat switches into the shape the screens use:
// booleans for game features, { id: true } maps for each pack type.
export function resolveFeatures(data) {
  const has = (id) => data?.all === true || data?.[id] === true;
  const owned = (ids) => Object.fromEntries(ids.filter(has).map((id) => [id, true]));
  return {
    ...Object.fromEntries(GAME_FEATURES.map((id) => [id, has(id)])),
    emotes: owned(PACK_FEATURES.emotes),
    themes: owned(PACK_FEATURES.themes),
    animations: owned(PACK_FEATURES.animations),
  };
}

export default function useFeatureFlags(userId) {
  const [flags, setFlags] = useState(defaultFlags);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Load cached flags first to avoid flash of "locked" state
    AsyncStorage.getItem(CACHE_KEY).then((cached) => {
      if (cached) {
        try {
          setFlags({ ...defaultFlags, ...JSON.parse(cached) });
        } catch {}
      }
    });

    const featuresRef = royRef(`/users/${userId}/features`);
    const unsubscribe = onValue(featuresRef, (snapshot) => {
      const resolved = resolveFeatures(snapshot.val());
      setFlags(resolved);
      setLoading(false);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(resolved)).catch(() => {});
    });

    return () => unsubscribe();
  }, [userId]);

  return { ...flags, loading };
}
