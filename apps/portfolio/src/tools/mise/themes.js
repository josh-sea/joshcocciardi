/* ------------------------------------------------------------------ */
/*  Mise: color themes                                                 */
/*                                                                     */
/*  Each theme is a set of CSS custom properties scoped to a `t-<key>` */
/*  class. Every color in styles.js and every inline owner color reads */
/*  from these, so a theme can be applied to the whole tool or to one  */
/*  plan card on the shelf. The chosen theme is stored per plan in     */
/*  `layout.theme`.                                                    */
/* ------------------------------------------------------------------ */

const PLEX = {
  sans: "'IBM Plex Sans',system-ui,sans-serif",
  cond: "'IBM Plex Sans Condensed',sans-serif",
  mono: "'IBM Plex Mono',monospace",
};

/* Token reference:
   paper     page background          chrome    top bar and dock
   surface   cells, cards, inputs     ink       body text
   strong    frame, outcome, buttons  onStrong  text on `strong`
   muted     secondary text           line      "r,g,b" for hairlines
   hi        selection and focus      hiSoft    current crumb
   hiInk     text on `hi`             d1, d2    depth tints
   hover     row hover                pillInk   text on owner pills
   danger*   delete and errors        us/them/third/complete  owner colors */
export const THEMES = [
  {
    key: "pine",
    name: "Pine",
    paper: "#F6F7F2", chrome: "#ECEDE6", surface: "#FFFFFF", ink: "#14201B",
    strong: "#1F4A3F", onStrong: "#ECEDE6", muted: "#3D6B5C", line: "31,74,63",
    hi: "#DFA327", hiSoft: "#F7E6BF", hiInk: "#2B1E00",
    d1: "#CFE0D5", d2: "#E5EEE7", hover: "#F1F4F0", pillInk: "#FFFFFF",
    danger: "#9B3A2E", dangerSoft: "#F7ECEA", dangerInk: "#7A2E24",
    us: "#2B6B58", them: "#C0722A", third: "#4A6FA5", complete: "#1F4A3F",
  },
  {
    key: "ember",
    name: "Ember",
    paper: "#FBF6F1", chrome: "#F5E8DC", surface: "#FFFFFF", ink: "#2A170B",
    strong: "#C2410C", onStrong: "#FFF4EA", muted: "#8A4B24", line: "194,65,12",
    hi: "#0E7490", hiSoft: "#CDEBF1", hiInk: "#FFFFFF",
    d1: "#F8D3B8", d2: "#FCE7D7", hover: "#FCF0E6", pillInk: "#FFFFFF",
    danger: "#A61B1B", dangerSoft: "#FBE9E9", dangerInk: "#7F1414",
    us: "#EA7A2B", them: "#2F6FB5", third: "#7C4DB0", complete: "#7C2D12",
  },
  {
    key: "harbor",
    name: "Harbor",
    paper: "#F3F6FA", chrome: "#E3EAF4", surface: "#FFFFFF", ink: "#0E1A2C",
    strong: "#1E3A6E", onStrong: "#EAF0F8", muted: "#46618A", line: "30,58,110",
    hi: "#F28C28", hiSoft: "#FDE5CB", hiInk: "#2B1600",
    d1: "#CAD8EC", d2: "#E1E9F4", hover: "#EDF2F8", pillInk: "#FFFFFF",
    danger: "#B42318", dangerSoft: "#FDECEA", dangerInk: "#8A1C13",
    us: "#2F6FDE", them: "#E0802A", third: "#119C93", complete: "#1E3A6E",
  },
  {
    key: "fuchsia",
    name: "Fuchsia",
    paper: "#FDF5FA", chrome: "#F7E3F0", surface: "#FFFFFF", ink: "#2A0C20",
    strong: "#B0136F", onStrong: "#FFF0F8", muted: "#86386C", line: "176,19,111",
    hi: "#0FA3A3", hiSoft: "#CDEFEF", hiInk: "#002A2A",
    d1: "#F3C6E1", d2: "#F9E0EF", hover: "#FBEDF5", pillInk: "#FFFFFF",
    danger: "#A3162B", dangerSoft: "#FBE8EB", dangerInk: "#7C1020",
    us: "#D6339C", them: "#F08A24", third: "#5B5BD6", complete: "#6E0C46",
  },
  {
    key: "ink",
    name: "Ink",
    paper: "#FFFFFF", chrome: "#F2F2F2", surface: "#FFFFFF", ink: "#000000",
    strong: "#000000", onStrong: "#FFFFFF", muted: "#555555", line: "0,0,0",
    hi: "#E10600", hiSoft: "#FFE2DF", hiInk: "#FFFFFF",
    d1: "#DDDDDD", d2: "#EFEFEF", hover: "#F5F5F5", pillInk: "#FFFFFF",
    danger: "#E10600", dangerSoft: "#FFEDEB", dangerInk: "#A00400",
    us: "#6B6B6B", them: "#E10600", third: "#BDBDBD", complete: "#000000",
  },
  {
    key: "terminal",
    name: "Terminal",
    dark: true,
    paper: "#050A05", chrome: "#0A120A", surface: "#0C160D", ink: "#39FF6A",
    strong: "#16A34A", onStrong: "#021006", muted: "#23A84B", line: "57,255,106",
    hi: "#FFB000", hiSoft: "#3A2900", hiInk: "#1A1000",
    d1: "#11331A", d2: "#0D2413", hover: "#102414", pillInk: "#021006",
    danger: "#FF5C5C", dangerSoft: "#2A0D0D", dangerInk: "#FF8A8A",
    us: "#39FF6A", them: "#FFB000", third: "#3BC9FF", complete: "#167A35",
    fonts: { sans: PLEX.mono, cond: PLEX.mono, mono: PLEX.mono },
  },
];

export const DEFAULT_THEME = "pine";
export const THEME_KEYS = THEMES.map((t) => t.key);
export const isTheme = (k) => THEME_KEYS.includes(k);
export const themeClass = (k) => `t-${isTheme(k) ? k : DEFAULT_THEME}`;

const block = (t) => {
  const f = t.fonts || PLEX;
  return `.t-${t.key}{
  --paper:${t.paper};--chrome:${t.chrome};--surface:${t.surface};--ink:${t.ink};
  --strong:${t.strong};--on-strong:${t.onStrong};--muted:${t.muted};--line:${t.line};
  --hi:${t.hi};--hi-soft:${t.hiSoft};--hi-ink:${t.hiInk};
  --d1:${t.d1};--d2:${t.d2};--hover:${t.hover};--pill-ink:${t.pillInk};
  --danger:${t.danger};--danger-soft:${t.dangerSoft};--danger-ink:${t.dangerInk};
  --own-us:${t.us};--own-them:${t.them};--own-third:${t.third};--complete:${t.complete};
  --font-sans:${f.sans};--font-cond:${f.cond};--font-mono:${f.mono};
  color-scheme:${t.dark ? "dark" : "light"};
}`;
};

export const THEME_CSS = THEMES.map(block).join("\n");
