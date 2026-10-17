// Move animation definitions
// Each animation defines a visual effect that plays on affected cells after a move.
// The animation preference is stored per-player in the game data so opponents see it.

export const ANIMATIONS = {
  none: {
    id: "none",
    name: "None",
    free: true,
    description: "No animation",
  },
  pulse: {
    id: "pulse",
    name: "Pulse",
    free: true,
    description: "Quick scale pulse",
  },
  slam: {
    id: "slam",
    name: "Slam",
    free: true,
    description: "Cells slam down hard",
  },
  wave: {
    id: "wave",
    name: "Wave",
    free: true,
    description: "Left-to-right wave",
  },
  ripple: {
    id: "ripple",
    name: "Ripple",
    free: true,
    description: "Ripple out from center",
  },
  electricity: {
    id: "electricity",
    name: "Electricity",
    price: "$2.99",
    free: false,
    description: "Electric flash on cells",
  },
  pixel_explosion: {
    id: "pixel_explosion",
    name: "Pixel Boom",
    price: "$2.99",
    free: false,
    description: "Pixel pop effect",
  },
  shockwave: {
    id: "shockwave",
    name: "Shockwave",
    price: "$2.99",
    free: false,
    description: "Ripple from center",
  },
};

export function getAnimationList() {
  return Object.values(ANIMATIONS);
}

export function getAnimation(animId) {
  return ANIMATIONS[animId] || ANIMATIONS.none;
}
