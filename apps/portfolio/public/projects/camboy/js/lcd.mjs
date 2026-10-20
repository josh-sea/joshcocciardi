/**
 * Camboy: the screen. 160x144 pixels and four shades, the same for every
 * cartridge. Games draw with palette indices 0 (lightest) to 3 (darkest),
 * so a different palette (a color model, one day) is a swap here.
 */

export const W = 160;
export const H = 144;
export const DMG = ["#e0f8d0", "#88c070", "#346856", "#081820"];

/* 3x5 pixel font. Each glyph is five rows of three bits. */
export const GLYPHS = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001010010",
  "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "!": "010010010000010", "?": "110001010000010", ".": "000000000000010", ":": "000010000010000",
  "-": "000000111000000", "'": "010010000000000", "/": "001001010100100", "%": "101001010100101",
  "+": "000010111010000", ",": "000000000010100", "<": "001010100010001", ">": "100010001010100",
  "&": "010101010101011", "#": "101111101111101", "*": "000101010101000", " ": "000000000000000",
};

/** Drawing helpers bound to one 2D context. */
export function makeLcd(g, pal = DMG) {
  g.imageSmoothingEnabled = false;
  const px = (x, y, c) => { g.fillStyle = pal[c]; g.fillRect(x | 0, y | 0, 1, 1); };
  const rect = (x, y, w, h, c) => { g.fillStyle = pal[c]; g.fillRect(x | 0, y | 0, w | 0, h | 0); };

  function ellipse(cx, cy, rx, ry, fill, edge) {
    for (let y = -ry; y <= ry; y++) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2)));
      if (fill != null) rect(cx - span, cy + y, span * 2 + 1, 1, fill);
      if (edge != null) { px(cx - span, cy + y, edge); px(cx + span, cy + y, edge); }
    }
    if (edge != null) {
      const top = Math.round(rx * Math.sqrt(Math.max(0, 1 - (ry / (ry + 0.5)) ** 2)));
      rect(cx - top, cy - ry, top * 2 + 1, 1, edge);
      rect(cx - top, cy + ry, top * 2 + 1, 1, edge);
    }
  }

  function arc(cx, cy, r, a0, a1, c, clip) {
    const steps = Math.ceil(r * Math.abs(a1 - a0) * 1.5);
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (!clip || clip(x, y)) px(x, y, c);
    }
  }

  function line(x0, y0, x1, y1, c) {
    const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(Math.round(x0 + (x1 - x0) * (i / n)), Math.round(y0 + (y1 - y0) * (i / n)), c);
  }

  function text(str, x, y, c, s = 1) {
    str = String(str).toUpperCase();
    for (let i = 0; i < str.length; i++) {
      const glyph = GLYPHS[str[i]] || GLYPHS["?"];
      for (let b = 0; b < 15; b++) {
        if (glyph[b] === "1") rect(x + (i * 4 + (b % 3)) * s, y + Math.floor(b / 3) * s, s, s, c);
      }
    }
  }
  const textW = (str, s = 1) => (String(str).length * 4 - 1) * s;
  const ctext = (str, y, c, s = 1, cx = W / 2) => text(str, Math.round(cx - textW(str, s) / 2), y, c, s);

  /** A boxed message, the kind a handheld throws up mid-game. */
  function banner(lines, y, s = 1) {
    const w = Math.max(...lines.map((l) => textW(l, s))) + 10;
    const h = lines.length * 7 * s + 6;
    const x = Math.round(W / 2 - w / 2);
    rect(x - 1, y - 1, w + 2, h + 2, 0);
    rect(x, y, w, h, 3);
    rect(x + 1, y + 1, w - 2, h - 2, 0);
    rect(x + 2, y + 2, w - 4, h - 4, 3);
    lines.forEach((l, i) => ctext(l, y + 4 + i * 7 * s, 0, s));
  }

  /**
   * Rows of palette digits, "." is see-through. Drawn from the feet up:
   * (x, y) is the bottom center. map swaps letters for palette digits.
   */
  function sprite(rows, x, y, flip = false, map = null, s = 1) {
    const h = rows.length;
    const w = rows[0].length;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        let ch = rows[r][flip ? w - 1 - c : c];
        if (ch === ".") continue;
        if (map && map[ch] != null) ch = map[ch];
        rect(x + (c - (w >> 1)) * s, y + (r - h) * s, s, s, +ch);
      }
    }
  }

  return { g, pal, W, H, px, rect, ellipse, arc, line, text, textW, ctext, banner, sprite };
}
