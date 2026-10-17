// Free emotes — always available to all players
export const FREE_EMOTES = [
  "🤮", "🔥", "😍", "😅", "😎", "😵", "🤬", "😈", "😮", "🫠",
];

// Premium emote pack definitions
export const EMOTE_PACKS = {
  savage_pack: {
    id: "savage_pack",
    name: "Savage Pack",
    price: "$1.99",
    emotes: ["💀", "🪦", "👑", "🧠", "🐍", "💅", "🤡", "🥱", "😤", "🫡"],
  },
  galaxy_pack: {
    id: "galaxy_pack",
    name: "Galaxy Pack",
    price: "$1.99",
    emotes: ["🌌", "🪐", "☄️", "🛸", "👽", "🌠", "🔮", "⚡", "🌀", "🫧"],
  },
  pixel_pack: {
    id: "pixel_pack",
    name: "Pixel Pack",
    price: "$1.99",
    emotes: ["👾", "🕹️", "🎮", "🤖", "💾", "🧩", "🎲", "🏆", "💣", "⭐"],
  },
};

// Get all emotes a user has access to based on their owned packs
export function getAvailableEmotes(ownedPacks = {}) {
  const allEmotes = [...FREE_EMOTES];
  Object.keys(EMOTE_PACKS).forEach((packId) => {
    if (ownedPacks[packId]) {
      allEmotes.push(...EMOTE_PACKS[packId].emotes);
    }
  });
  return allEmotes;
}
