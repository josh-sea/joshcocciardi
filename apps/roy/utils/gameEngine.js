// Board configurations for each game mode
export const BOARD_CONFIGS = {
  "5x5": { size: 5, cells: 25, winAt: 13 },
  "10x10": { size: 10, cells: 100, winAt: 51 },
  "15x15": { size: 15, cells: 225, winAt: 113 },
};

// Shape names available for Strategist Edition
export const SHAPE_NAMES = ["classic", "cross", "sweep"];

// Shape display info for UI
export const SHAPE_INFO = {
  classic: { name: "Classic", description: "Diagonal sweep" },
  cross: { name: "Cross", description: "Cardinal + corners" },
  sweep: { name: "Sweep", description: "Top push down" },
};

// Get the shape indices for a move at the given index.
// Each shape defines which 4 neighbors get player color and which 4 get red.
// Edge cases: cells on left/right edges have reduced neighbor sets to prevent
// wrapping to the wrong row.
export function getShapeIndices(index, rowWidth, shapeName = "classic") {
  const totalCells = rowWidth * rowWidth;
  const col = index % rowWidth;
  const isLeftEdge = col === 0;
  const isRightEdge = col === rowWidth - 1;

  let playerOffsets, redOffsets;

  if (shapeName === "classic") {
    // Player: upper-left, left, lower-left, below
    // Red: above, upper-right, right, lower-right
    playerOffsets = [-(rowWidth + 1), -1, rowWidth - 1, rowWidth];
    redOffsets = [-rowWidth, -(rowWidth - 1), 1, rowWidth + 1];

    if (isLeftEdge) {
      // Left edge: only keep offsets that don't wrap left
      playerOffsets = [rowWidth];
    }
    if (isRightEdge) {
      // Right edge: only keep offsets that don't wrap right
      redOffsets = [-rowWidth];
    }
  } else if (shapeName === "cross") {
    // Player: above, left, right, below (cardinal "+")
    // Red: upper-left, upper-right, lower-left, lower-right (diagonal "X")
    playerOffsets = [-rowWidth, -1, 1, rowWidth];
    redOffsets = [-(rowWidth + 1), -(rowWidth - 1), rowWidth - 1, rowWidth + 1];

    if (isLeftEdge) {
      playerOffsets = [-rowWidth, 1, rowWidth];
      redOffsets = [-(rowWidth - 1), rowWidth + 1];
    }
    if (isRightEdge) {
      playerOffsets = [-rowWidth, -1, rowWidth];
      redOffsets = [-(rowWidth + 1), rowWidth - 1];
    }
  } else if (shapeName === "sweep") {
    // Player: upper-left, above, upper-right, left (top half)
    // Red: right, lower-left, below, lower-right (bottom half)
    playerOffsets = [-(rowWidth + 1), -rowWidth, -(rowWidth - 1), -1];
    redOffsets = [1, rowWidth - 1, rowWidth, rowWidth + 1];

    if (isLeftEdge) {
      playerOffsets = [-rowWidth, -(rowWidth - 1)];
      redOffsets = [1, rowWidth, rowWidth + 1];
    }
    if (isRightEdge) {
      playerOffsets = [-(rowWidth + 1), -rowWidth, -1];
      redOffsets = [rowWidth - 1, rowWidth];
    }
  }

  const playerIndices = playerOffsets
    .map((off) => index + off)
    .filter((i) => i >= 0 && i < totalCells);
  const redIndices = redOffsets
    .map((off) => index + off)
    .filter((i) => i >= 0 && i < totalCells);

  return { playerIndices, redIndices };
}

// Generate the shape rotation order for a Strategist game.
// startIndex is which shape the player picks first (0, 1, or 2).
// The other two positions are randomized.
export function generateShapeOrder(startIndex) {
  const remaining = [0, 1, 2].filter((i) => i !== startIndex);
  // Shuffle remaining two
  if (Math.random() > 0.5) {
    remaining.reverse();
  }
  return [startIndex, remaining[0], remaining[1]];
}

// Get the current shape name for a player given their move count and shape order
export function getCurrentShape(moveCount, shapeOrder) {
  const shapeIndex = shapeOrder[moveCount % 3];
  return SHAPE_NAMES[shapeIndex];
}

// Get the next shape name for a player
export function getNextShape(moveCount, shapeOrder) {
  const nextIndex = shapeOrder[(moveCount + 1) % 3];
  return SHAPE_NAMES[nextIndex];
}

// Get the shape preview grid (5x5) showing which cells are affected.
// Returns an array of { row, col, type } where type is "center", "player", or "red".
export function getShapePreviewCells(shapeName) {
  // Use center of a 5x5 grid (index 12, rowWidth 5) to generate the pattern
  const centerIndex = 12;
  const previewRowWidth = 5;
  const { playerIndices, redIndices } = getShapeIndices(centerIndex, previewRowWidth, shapeName);

  const cells = [];
  for (let i = 0; i < 25; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    let type = "empty";
    if (i === centerIndex) type = "center";
    else if (playerIndices.includes(i)) type = "player";
    else if (redIndices.includes(i)) type = "red";
    cells.push({ row, col, type });
  }
  return cells;
}

// Color blending logic
export function blendColors(color, currentPlayer, type) {
  if (type === "player") {
    if (color === null && currentPlayer === 1) return 2;
    if (color === null && currentPlayer === 2) return 4;
    if (color === 1) return 1;
    if (color === 5) return 5;
    if (color === 2 && currentPlayer === 2) return null;
    if (currentPlayer === 1 && color === 2) return 2;
    if (currentPlayer === 1 && color === 4) return null;
    if (currentPlayer === 1 && color === 3) return 1;
    if (currentPlayer === 2 && color === 2) return null;
    if (currentPlayer === 2 && color === 4) return 4;
    if (currentPlayer === 2 && color === 3) return 5;
  } else if (type === "red") {
    if (color === null) return 3;
    if (color === 1) return 1;
    if (color === 5) return 5;
    if (color === 2) return 1;
    if (color === 4) return 5;
    if (color === 3) return 3;
  }
}

// Apply a shape move to the grid and return the updated grid
export function applyMove(gridData, index, currentPlayer, rowWidth, shapeName = "classic") {
  const updatedGrid = [...gridData];
  updatedGrid[index] = currentPlayer === 1 ? 1 : 5;

  const { playerIndices, redIndices } = getShapeIndices(index, rowWidth, shapeName);

  playerIndices.forEach((idx) => {
    updatedGrid[idx] = blendColors(updatedGrid[idx], currentPlayer, "player") ?? null;
  });

  redIndices.forEach((idx) => {
    updatedGrid[idx] = blendColors(updatedGrid[idx], currentPlayer, "red") ?? null;
  });

  return updatedGrid;
}

// Calculate scores from grid data
export function calculateScores(gridData) {
  if (!gridData) return { player1: 0, player2: 0 };
  return {
    player1: gridData.filter((color) => color === 1).length,
    player2: gridData.filter((color) => color === 5).length,
  };
}

// Map color value to display color string
export function getCellColor(value) {
  switch (value) {
    case 1: return "orange";
    case 2: return "yellow";
    case 3: return "red";
    case 4: return "blue";
    case 5: return "purple";
    default: return "white";
  }
}

// Responsive box dimensions based on screen size and board config
export function getBoxDimensions(width, height, boardSize = "10x10") {
  const config = BOARD_CONFIGS[boardSize];
  const isSmallScreen = width < 376;
  const isShortScreen = height < 670;
  const isBigTall = height > 1000;
  const isBigWide = width > 750;

  let boxWidth, boxHeight, boxMargin;

  if (boardSize === "15x15") {
    // Tighter sizing for 15x15 to fit on screen
    boxWidth = Math.floor((width - 40) / config.size) - 4;
    boxHeight = boxWidth;
    boxMargin = 1;
  } else if (boardSize === "5x5") {
    // Larger cells for 5x5 — more impactful feel
    boxWidth = isSmallScreen ? 55 : isBigWide ? 120 : 60;
    boxHeight = isShortScreen ? 50 : isBigTall ? 120 : 65;
    boxMargin = isSmallScreen ? 3 : isBigTall ? 8 : 3;
  } else {
    // Default 10x10 — matches current sizing
    boxWidth = isSmallScreen ? 30 : isBigWide ? 75 : 33;
    boxHeight = isShortScreen ? 30 : isBigTall ? 75 : 45;
    boxMargin = isSmallScreen ? 2 : isBigTall ? 7 : 2;
  }

  const titleSize = isSmallScreen ? 18 : isBigWide ? 32 : 24;

  return { boxWidth, boxHeight, boxMargin, titleSize };
}
