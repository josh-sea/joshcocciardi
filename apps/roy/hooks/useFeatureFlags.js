import { useEffect, useState } from "react";
import { database } from "../admin/firebaseConfig";
import { ref, onValue } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEY = "roy_feature_flags";

const defaultFlags = {
  unlimitedGames: false,
  deathmatch: false,
  strategist: false,
  emotes: {},
  themes: {},
  animations: {},
};

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

    const featuresRef = ref(database, `/users/${userId}/features`);
    const unsubscribe = onValue(featuresRef, (snapshot) => {
      const data = snapshot.val();
      const resolved = {
        unlimitedGames: data?.unlimitedGames || false,
        deathmatch: data?.deathmatch || false,
        strategist: data?.strategist || false,
        emotes: data?.emotes || {},
        themes: data?.themes || {},
        animations: data?.animations || {},
      };
      setFlags(resolved);
      setLoading(false);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(resolved)).catch(() => {});
    });

    return () => unsubscribe();
  }, [userId]);

  return { ...flags, loading };
}
