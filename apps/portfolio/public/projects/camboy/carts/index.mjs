/**
 * Every cartridge in the book, in page order. Add a game by giving it a
 * folder with a game.mjs that exports meta, cover(lcd) and boot(hw).
 *
 * label is the sticker color behind the cover art.
 */
export const CARTS = [
  { id: "sweat-boy", title: "SWEAT BOY", label: "#e8a23b", load: () => import("./sweat-boy/game.mjs") },
];

/** Four pockets to a page. */
export const PER_PAGE = 4;
