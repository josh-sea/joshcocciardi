/**
 * Every cartridge in the book, in page order. Add a game by giving it a
 * folder with a game.mjs that exports meta, cover(lcd) and boot(hw).
 *
 * label is the sticker color behind the cover art.
 */
export const CARTS = [
  { id: "sweat-boy", title: "SWEAT BOY", label: "#e8a23b", load: () => import("./sweat-boy/game.mjs") },
  { id: "boulder", title: "BOULDER SMASH", label: "#6fae6a", load: () => import("./boulder/game.mjs") },
  { id: "dark-hat", title: "DARK HAT", label: "#7a5aa8", load: () => import("./dark-hat/game.mjs") },
  { id: "conway-doom", title: "CONWAY'S DOOM", label: "#c0504d", load: () => import("./conway-doom/game.mjs") },
];

/** Four pockets to a page. */
export const PER_PAGE = 4;
