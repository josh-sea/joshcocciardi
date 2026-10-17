import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTheme } from "../utils/themeData";

const THEME_KEY = "roy_selected_theme";

export default function useTheme() {
  const [themeId, setThemeId] = useState("default");
  const [theme, setTheme] = useState(getTheme("default"));

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved) {
        setThemeId(saved);
        setTheme(getTheme(saved));
      }
    });
  }, []);

  const selectTheme = async (id) => {
    setThemeId(id);
    setTheme(getTheme(id));
    await AsyncStorage.setItem(THEME_KEY, id);
  };

  return { themeId, theme, selectTheme };
}
