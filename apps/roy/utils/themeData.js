// Board theme definitions
// IMPORTANT: Themes NEVER change piece colors (orange, yellow, red, blue, purple, white).
// They only affect the board background, cell borders, and container background.

export const THEMES = {
  default: {
    id: "default",
    name: "Classic",
    free: true,
    containerBg: undefined, // uses default (no override)
    cellBorderColor: "black",
    selectedBorderColor: "lightgreen",
    boardBg: undefined,
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    price: "$1.99",
    free: false,
    containerBg: "#1a1a2e",
    cellBorderColor: "#4a4a6a",
    selectedBorderColor: "#00ff88",
    boardBg: "#16213e",
  },
  neon_arcade: {
    id: "neon_arcade",
    name: "Neon Arcade",
    price: "$1.99",
    free: false,
    containerBg: "#0d0d0d",
    cellBorderColor: "#ff00ff",
    selectedBorderColor: "#00ffff",
    boardBg: "#1a0a2e",
  },
  retro_green: {
    id: "retro_green",
    name: "Green Screen",
    price: "$1.99",
    free: false,
    containerBg: "#0a1a0a",
    cellBorderColor: "#33ff33",
    selectedBorderColor: "#ffff00",
    boardBg: "#0d2b0d",
  },
};

// Get list of all themes for the theme selector
export function getThemeList() {
  return Object.values(THEMES);
}

// Get a theme by id, fallback to default
export function getTheme(themeId) {
  return THEMES[themeId] || THEMES.default;
}
