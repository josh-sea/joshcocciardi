// ─── PSX Station Configuration ───────────────────────────────────────────────
//   • The emulator is EmulatorJS (libretro cores compiled to WebAssembly),
//     loaded from its CDN. Nothing about it is bundled into this repo.
//   • Game discs live in the browser (IndexedDB) — they are never uploaded.
//     Only save states and a small metadata row sync to Firebase.
//   • Firebase web config lives in js/store.js (web config values are public).

window.APP_CONFIG = {
  // Where EmulatorJS serves its loader, cores and decompression workers from.
  // Swap to a self-hosted copy by pointing this at your own /data/ folder.
  emulator_data_path: 'https://cdn.emulatorjs.org/stable/data/',

  // Generic system key. EmulatorJS maps 'psx' → [pcsx_rearmed, mednafen_psx_hw]
  // and exposes both in its in-game settings menu under "Core".
  //   pcsx_rearmed    — default. Has an HLE BIOS, so it plays without a real one.
  //   mednafen_psx_hw — more accurate, upscales, but REQUIRES a real BIOS dump.
  emulator_core: 'psx',

  // Accent color for the emulator's own menus/loading screen.
  emulator_color: '#7c5cff',

  // Archives and raw disc images the picker will accept. EmulatorJS sniffs
  // magic bytes rather than trusting the extension, so .7z/.zip/.rar all work
  // regardless of what the file is called.
  accepted_extensions: [
    '.7z', '.zip', '.rar',
    '.bin', '.cue', '.img', '.iso', '.chd', '.pbp', '.ecm', '.m3u',
  ],

  // Save-state slots offered per game. Slot 0 is reserved for the automatic
  // "last played" state written when you leave a game.
  save_slots: [1, 2, 3, 4],

  // Refuse to sync a state larger than this to Cloud Storage. Real PS1 states
  // land around 1-9MB depending on core; this is headroom, not a target.
  max_state_bytes: 32 * 1024 * 1024,

  // How long to wait for the emulator to come up before telling the player
  // something is wrong. Only covers loader.js and emulator.min.js (a few
  // hundred KB); the multi-MB core download reports its own progress after
  // that and is not on this clock.
  emulator_boot_timeout_ms: 25000,

  // Warn (but don't block) when a single disc is bigger than this. Everything
  // is decompressed into memory before it boots, so very large discs can fail
  // on low-RAM devices rather than on disk.
  large_disc_warn_bytes: 900 * 1024 * 1024,
};
