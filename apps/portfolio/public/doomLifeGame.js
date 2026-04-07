// Conway's DOOM - A fusion of Conway's Game of Life and first-person shooter
// Main game script

// Initialize game when loaded
window.initDoomLifeGame = function() {
  console.log("Initializing Conway's DOOM");
  
  // Get canvas and context
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error("Canvas element not found");
    return;
  }
  
  const ctx = canvas.getContext('2d');

  // DOM Elements for UI
  const healthDisplay = document.getElementById('health');
  const ammoDisplay = document.getElementById('ammo');
  const levelDisplay = document.getElementById('level');
  const generationDisplay = document.getElementById('generation');
  const positionDisplay = document.getElementById('position');
  const objectiveDisplay = document.getElementById('objective');
  const restartButton = document.getElementById('restartButton');
  const helpButton = document.getElementById('helpButton');
  const helpModal = document.getElementById('helpModal');
  const closeButton = document.getElementById('closeHelp');

  // Game variables
  let player, grid = [], bullets = [];
  let health = 100;
  let ammo = 20;
  let maxAmmo = 20;
  let currentLevel = 1;
  let generation = 0;
  let gameRunning = false;
  let gameLoopId;
  let evolutionTimer = 0;
  let invulnerabilityTimer = 0;
  
  // Grid settings
  const cellSize = 20;
  let gridWidth = 15; // Grows by 3 each level
  let gridHeight = 15;
  let finishX, finishY;

  // Input states
  window.gameKeys = {
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
    r: false
  };

  // Expose resize function to window for React component
  window.resizeGameCanvas = function() {
    const container = document.querySelector('.game-container');
    if (!container || !canvas) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = Math.min(600, window.innerHeight - 200);
    
    canvas.width = containerWidth;
    canvas.height = containerHeight;
  };

  // --- Game Object Classes ---
  class Player {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.direction = 0; // 0: North, 1: East, 2: South, 3: West
      this.color = '#00FF00';
      this.speed = 0.1;
      this.turnSpeed = 0.05;
      this.moveAnimation = 0;
    }

    update() {
      // Movement - Fixed coordinate system
      if (window.gameKeys.up) {
        // Move forward in the direction you're facing
        this.x += Math.sin(this.direction) * this.speed;
        this.y -= Math.cos(this.direction) * this.speed; // Subtract for forward (Y axis inverted)
        this.moveAnimation += 0.2;
      }
      if (window.gameKeys.down) {
        // Move backward
        this.x -= Math.sin(this.direction) * this.speed;
        this.y += Math.cos(this.direction) * this.speed; // Add for backward
        this.moveAnimation += 0.2;
      }
      
      // Turning
      if (window.gameKeys.left) {
        this.direction -= this.turnSpeed; // Turn left
      }
      if (window.gameKeys.right) {
        this.direction += this.turnSpeed; // Turn right
      }
      
      // Keep player in bounds
      this.x = Math.max(1, Math.min(gridWidth - 2, this.x));
      this.y = Math.max(1, Math.min(gridHeight - 2, this.y));
      
      // Shooting
      if (window.gameKeys.space && ammo > 0 && !this.shootCooldown) {
        this.shoot();
        this.shootCooldown = 10;
      }
      
      if (this.shootCooldown > 0) this.shootCooldown--;
      
      // Update position display
      if (positionDisplay) {
        positionDisplay.textContent = `Position: ${Math.floor(this.x)}, ${Math.floor(this.y)}`;
      }
    }

    shoot() {
      ammo--;
      updateUI();
      
      // Create bullet with fixed direction
      const bulletX = this.x + Math.sin(this.direction) * 0.5;
      const bulletY = this.y - Math.cos(this.direction) * 0.5; // Subtract for forward
      bullets.push(new Bullet(bulletX, bulletY, this.direction));
    }

    draw() {
      // Draw player as a small circle with direction indicator
      const screenX = (this.x / gridWidth) * canvas.width;
      const screenY = (this.y / gridHeight) * canvas.height;
      
      // Player body
      ctx.fillStyle = this.invulnerable && Math.floor(this.invulnerabilityTimer / 5) % 2 ? 
                     'rgba(0, 255, 0, 0.5)' : this.color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Direction indicator - Fixed drawing
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(
        screenX + Math.sin(this.direction) * 15,
        screenY - Math.cos(this.direction) * 15 // Subtract for correct direction
      );
      ctx.stroke();
    }

    takeDamage(amount) {
      if (this.invulnerable) return;
      
      health -= amount;
      this.invulnerable = true;
      this.invulnerabilityTimer = 60; // 1 second at 60fps
      
      updateUI();
      
      if (health <= 0) {
        gameOver("Game Over! You were consumed by the evolving patterns!");
      }
    }
  }

  class Bullet {
    constructor(x, y, direction) {
      this.x = x;
      this.y = y;
      this.direction = direction;
      this.speed = 0.3;
      this.life = 50;
    }

    update() {
      // Fixed bullet movement
      this.x += Math.sin(this.direction) * this.speed;
      this.y -= Math.cos(this.direction) * this.speed; // Subtract for forward
      this.life--;
      
      // Check collision with walls/living cells
      const gridX = Math.floor(this.x);
      const gridY = Math.floor(this.y);
      
      if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
        if (grid[gridY] && grid[gridY][gridX] === 1) {
          grid[gridY][gridX] = 0; // Destroy the wall/cell
          this.life = 0;
        }
      }
      
      return this.life > 0;
    }

    draw() {
      const screenX = (this.x / gridWidth) * canvas.width;
      const screenY = (this.y / gridHeight) * canvas.height;
      
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Grid and Conway's Game of Life Logic ---
  function initializeGrid() {
    grid = [];
    for (let y = 0; y < gridHeight; y++) {
      grid[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        // Create walls around the border
        if (x === 0 || x === gridWidth - 1 || y === 0 || y === gridHeight - 1) {
          grid[y][x] = 1;
        } else {
          // Random initial pattern
          grid[y][x] = Math.random() < 0.2 ? 1 : 0;
        }
      }
    }
    
    // Set finish area (magenta/yellow checkerboard)
    finishX = gridWidth - 3;
    finishY = gridHeight - 3;
    createFinishArea();
    
    // Add some ammo boxes
    placeAmmoBoxes();
  }

  function createFinishArea() {
    // Create a 2x2 checkerboard pattern at the finish
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = finishX + dx;
        const y = finishY + dy;
        if (x < gridWidth && y < gridHeight) {
          // Checkerboard pattern with magenta and yellow
          grid[y][x] = (dx + dy) % 2 === 0 ? 2 : 3; // 2: magenta, 3: yellow
        }
      }
    }
  }

  function placeAmmoBoxes() {
    // Place a few ammo boxes on the map
    for (let i = 0; i < 3; i++) {
      let x, y;
      do {
        x = Math.floor(Math.random() * (gridWidth - 4)) + 2;
        y = Math.floor(Math.random() * (gridHeight - 4)) + 2;
      } while (grid[y][x] !== 0);
      
      grid[y][x] = 4; // 4: ammo box
    }
  }

  function evolveGrid() {
    const newGrid = [];
    
    for (let y = 0; y < gridHeight; y++) {
      newGrid[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        const neighbors = countNeighbors(x, y);
        const current = grid[y][x];
        
        // Conway's Game of Life rules
        if (current === 1) { // Living cell
          newGrid[y][x] = (neighbors === 2 || neighbors === 3) ? 1 : 0;
        } else if (current === 0) { // Dead cell
          newGrid[y][x] = (neighbors === 3) ? 1 : 0;
        } else {
          // Special cells (finish area, ammo boxes) don't evolve
          newGrid[y][x] = current;
        }
      }
    }
    
    grid = newGrid;
    generation++;
    
    // Check if player is hit by living cells
    checkPlayerCollision();
    
    updateUI();
  }

  function countNeighbors(x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
          if (grid[ny][nx] === 1) count++;
        }
      }
    }
    return count;
  }

  function checkPlayerCollision() {
    const playerGridX = Math.floor(player.x);
    const playerGridY = Math.floor(player.y);
    
    if (grid[playerGridY] && grid[playerGridY][playerGridX] === 1) {
      player.takeDamage(10);
    }
    
    // Check ammo collection
    if (grid[playerGridY] && grid[playerGridY][playerGridX] === 4) {
      ammo = Math.min(maxAmmo, ammo + 10);
      grid[playerGridY][playerGridX] = 0;
      updateUI();
    }
    
    // Check if reached finish
    if (playerGridX >= finishX && playerGridX < finishX + 2 &&
        playerGridY >= finishY && playerGridY < finishY + 2) {
      levelComplete();
    }
  }

  function drawGrid() {
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const cell = grid[y][x];
        if (cell === 0) continue;
        
        const screenX = (x / gridWidth) * canvas.width;
        const screenY = (y / gridHeight) * canvas.height;
        const screenCellWidth = canvas.width / gridWidth;
        const screenCellHeight = canvas.height / gridHeight;
        
        // Set color based on cell type
        switch(cell) {
          case 1: // Living cell (wall)
            ctx.fillStyle = '#666666';
            break;
          case 2: // Magenta finish
            ctx.fillStyle = '#FF00FF';
            break;
          case 3: // Yellow finish
            ctx.fillStyle = '#FFFF00';
            break;
          case 4: // Ammo box
            ctx.fillStyle = '#00FFFF';
            break;
        }
        
        ctx.fillRect(screenX, screenY, screenCellWidth, screenCellHeight);
      }
    }
  }

  // --- Game State Management ---
  function updateUI() {
    if (healthDisplay) healthDisplay.textContent = `Health: ${health}`;
    if (ammoDisplay) ammoDisplay.textContent = `Ammo: ${ammo} / ${maxAmmo}`;
    if (levelDisplay) levelDisplay.textContent = `Level: ${currentLevel}`;
    if (generationDisplay) generationDisplay.textContent = `Generation: ${generation}`;
  }

  function levelComplete() {
    gameRunning = false;
    currentLevel++;
    gridWidth += 3;
    gridHeight += 3;
    
    setTimeout(() => {
      initializeGrid();
      player.x = 1.5;
      player.y = 1.5;
      ammo = maxAmmo;
      health = Math.min(100, health + 20);
      gameRunning = true;
      updateUI();
    }, 2000);
  }

  function gameOver(message) {
    gameRunning = false;
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
    
    setTimeout(() => {
      if (confirm(message + " Click OK to restart.")) {
        resetGame();
      }
    }, 100);
  }

  function resetGame() {
    health = 100;
    ammo = maxAmmo;
    currentLevel = 1;
    generation = 0;
    gridWidth = 15;
    gridHeight = 15;
    evolutionTimer = 0;
    
    initializeGrid();
    player = new Player(1.5, 1.5);
    bullets = [];
    gameRunning = true;
    
    updateUI();
    gameLoop();
  }

  // --- Game Loop ---
  function gameLoop() {
    if (!gameRunning) {
      gameLoopId = requestAnimationFrame(gameLoop);
      return;
    }
    
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update evolution timer (evolve every 3 seconds)
    evolutionTimer++;
    if (evolutionTimer >= 180) { // 3 seconds at 60fps
      evolveGrid();
      evolutionTimer = 0;
    }
    
    // Update invulnerability
    if (player && player.invulnerable) {
      player.invulnerabilityTimer--;
      if (player.invulnerabilityTimer <= 0) {
        player.invulnerable = false;
      }
    }
    
    // Update and draw grid
    drawGrid();
    
    // Update and draw bullets
    bullets = bullets.filter(bullet => {
      const alive = bullet.update();
      if (alive) bullet.draw();
      return alive;
    });
    
    // Update and draw player
    if (player) {
      player.update();
      player.draw();
    }
    
    // Continue game loop
    gameLoopId = requestAnimationFrame(gameLoop);
  }

  // --- Event Handlers ---
  function handleKeyDown(e) {
    switch(e.key.toLowerCase()) {
      case 'arrowup': window.gameKeys.up = true; e.preventDefault(); break;
      case 'arrowdown': window.gameKeys.down = true; e.preventDefault(); break;
      case 'arrowleft': window.gameKeys.left = true; e.preventDefault(); break;
      case 'arrowright': window.gameKeys.right = true; e.preventDefault(); break;
      case ' ': window.gameKeys.space = true; e.preventDefault(); break;
      case 'r': window.gameKeys.r = true; e.preventDefault(); break;
    }
  }

  function handleKeyUp(e) {
    switch(e.key.toLowerCase()) {
      case 'arrowup': window.gameKeys.up = false; break;
      case 'arrowdown': window.gameKeys.down = false; break;
      case 'arrowleft': window.gameKeys.left = false; break;
      case 'arrowright': window.gameKeys.right = false; break;
      case ' ': window.gameKeys.space = false; break;
      case 'r': window.gameKeys.r = false; break;
    }
  }

  // --- Initialize Game ---
  function initGame() {
    // Set up canvas
    window.resizeGameCanvas();
    
    // Set up event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // Set up UI event listeners
    if (restartButton) {
      restartButton.addEventListener('click', resetGame);
    }
    
    if (helpButton && helpModal && closeButton) {
      helpButton.addEventListener('click', () => {
        helpModal.style.display = 'block';
      });
      
      closeButton.addEventListener('click', () => {
        helpModal.style.display = 'none';
      });
    }
    
    // Initialize game state
    initializeGrid();
    player = new Player(1.5, 1.5);
    gameRunning = true;
    
    // Update UI
    updateUI();
    
    // Start game loop
    gameLoop();
  }

  // Start the game
  initGame();
};
