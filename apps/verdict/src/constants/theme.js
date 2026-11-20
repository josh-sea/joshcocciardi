// One dark theme: the lights are down, the movie's on.
export const colors = {
  bg: '#14110F',
  surface: '#1E1A17',
  surface2: '#29231F',
  border: '#3A322C',
  text: '#F4EDE4',
  muted: '#A89A8C',
  faint: '#6E6258',
  accent: '#F2C14E',
  accentText: '#1A1405',
  up: '#4CC38A',
  meh: '#8FA3B8',
  down: '#E5675A',
  danger: '#E5675A',
  star: '#F2C14E',
};

export const space = (n) => n * 4;

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

export const type = {
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  tiny: { fontSize: 11, color: colors.faint, letterSpacing: 0.4 },
};
