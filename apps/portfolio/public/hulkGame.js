// Hulk Game - 8-bit style platformer
// Main game script for React version

// Initialize game when loaded
window.initHulkGame = function() {
  console.log("Initializing Hulk Game");
  
  // Get canvas and context
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error("Canvas element not found");
    return;
  }
  
  const ctx = canvas.getContext('2d');

  // DOM Elements for UI
  const scoreDisplay = document.getElementById('score');
  const levelNumberDisplay = document.getElementById('levelNumber');
  const objectsToSmashDisplay = document.getElementById('objectsToSmash');
  const totalObjectsDisplay = document.getElementById('totalObjects');
  const healthDisplay = document.getElementById('health');
  const messageBox = document.getElementById('messageBox');
  const messageText = document.getElementById('messageText');
  const messageButton = document.getElementById('messageButton');

  // Game variables
  let hulk, platforms = [], smashableObjects = [], enemies = [];
  let score = 0; 
  let health = 100;
  let smashedCount = 0;
  let totalSmashableInLevel = 0;
  let cameraX = 0;
  const levelWidth = 2000; 
  const gravity = 0.8;
  const jumpPower = -16; 
  const moveSpeed = 5;
  let gameRunning = false;
  let levelComplete = false; 
  let allLevelsComplete = false; 
  let gameLoopId; 

  // Screen Shake Variables
  let screenShakeIntensity = 0;
  let screenShakeTimer = 0;

  // Level Management
  let currentLevelIndex = 0;
  let levelsData = [];

  // Input states - expose to window for React component
  window.gameKeys = {
    left: false,
    right: false,
    up: false, 
    down: false, 
    space: false,
    g: false 
  };

  // Expose resize function to window for React component
  window.resizeGameCanvas = function() {
    const container = document.querySelector('.game-container');
    if (!container || !canvas) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = Math.min(600, window.innerHeight - 200);
    
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    // Adjust camera if needed
    if (hulk && hulk.x > canvas.width / 2) {
      cameraX = Math.min(Math.max(0, hulk.x - canvas.width / 2), levelWidth - canvas.width);
    }
  };

  // --- Game Object Classes ---
  class Hulk {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.width = 40;
      this.height = 60;
      this.color = '#00AA00';
      this.dx = 0;
      this.dy = 0;
      this.onGround = false;
      this.isSmashing = false;
      this.smashCooldown = 0;
      this.smashDuration = 15;
      this.smashTimer = 0;
      this.invulnerable = false;
      this.invulnerableTimer = 0;
      this.invulnerableDuration = 60;
      this.lastDirection = 'right';
      this.maxJumps = 2;
      this.jumpsLeft = this.maxJumps;
      this.jumpKeyPressed = false;
    }

    draw() {
      if (this.invulnerable && Math.floor(this.invulnerableTimer / 10) % 2 === 0) {
        // Flashing effect when invulnerable
        ctx.fillStyle = 'rgba(0, 170, 0, 0.5)';
      } else {
        ctx.fillStyle = this.color;
      }
      ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);

      // Draw smash effect
      if (this.isSmashing) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
        const smashDirection = this.lastDirection === 'left' ? -1 : 1;
        const smashBoxWidth = this.width * 0.75;
        const smashBoxHeight = this.height * 0.75;
        const smashBoxY = this.y + (this.height - smashBoxHeight) / 2;
        const smashBoxX = smashDirection === 1 ? (this.x + this.width) : (this.x - smashBoxWidth);
        ctx.fillRect(smashBoxX - cameraX, smashBoxY, smashBoxWidth, smashBoxHeight);
      }
    }

    update() {
      // Movement
      if (window.gameKeys.left) {
        this.dx = -moveSpeed;
        this.lastDirection = 'left';
      } else if (window.gameKeys.right) {
        this.dx = moveSpeed;
        this.lastDirection = 'right';
      } else {
        this.dx = 0;
      }

      // Jumping
      if (window.gameKeys.up && this.jumpsLeft > 0) {
        if (!this.jumpKeyPressed) {
          this.dy = jumpPower;
          this.onGround = false;
          this.jumpsLeft--;
          this.jumpKeyPressed = true;
        }
      } else if (!window.gameKeys.up) {
        this.jumpKeyPressed = false;
      }

      // Apply gravity and movement
      this.dy += gravity;
      this.y += this.dy;
      this.x += this.dx;

      // Boundaries
      if (this.x < 0) this.x = 0;
      if (this.x + this.width > levelWidth) this.x = levelWidth - this.width;

      // Smashing
      if (this.smashCooldown > 0) this.smashCooldown--;
      if (window.gameKeys.space && this.smashCooldown === 0) {
        this.isSmashing = true;
        this.smashTimer = this.smashDuration;
        this.smashCooldown = 30;
      }
      if (this.isSmashing) {
        this.smashTimer--;
        if (this.smashTimer <= 0) this.isSmashing = false;
      }

      // Invulnerability
      if (this.invulnerable) {
        this.invulnerableTimer--;
        if (this.invulnerableTimer <= 0) this.invulnerable = false;
      }

      // Platform collision
      this.onGround = false;
      platforms.forEach(platform => {
        if (this.x < platform.x + platform.width && this.x + this.width > platform.x &&
            this.y + this.height >= platform.y && this.y + this.height - this.dy <= platform.y + 1) {
          this.y = platform.y - this.height;
          this.dy = 0;
          this.onGround = true;
          this.jumpsLeft = this.maxJumps;
        }
      });

      // Fall detection
      if (this.y > canvas.height) {
        gameOver("Hulk fell into the abyss!");
      }
    }
  }

  class Platform {
    constructor(x, y, width, height, color) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.color = color;
    }

    draw() {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
    }
  }

  class SmashableObject {
    constructor(x, y, width, height, color, points) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.color = color;
      this.points = points;
      this.smashed = false;
    }

    draw() {
      if (!this.smashed) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
      }
    }

    checkSmash() {
      if (!this.smashed && hulk.isSmashing) {
        const smashDirection = hulk.lastDirection === 'left' ? -1 : 1;
        const smashBoxWidth = hulk.width * 0.75;
        const smashBoxHeight = hulk.height * 0.75;
        const smashBoxY = hulk.y + (hulk.height - smashBoxHeight) / 2;
        const smashBoxX = smashDirection === 1 ? (hulk.x + hulk.width) : (hulk.x - smashBoxWidth);
        
        if (smashBoxX < this.x + this.width && smashBoxX + smashBoxWidth > this.x &&
            smashBoxY < this.y + this.height && smashBoxY + smashBoxHeight > this.y) {
          this.smashed = true;
          score += this.points;
          smashedCount++;
          updateUI();
          
          if (smashedCount >= totalSmashableInLevel) {
            levelComplete = true;
            currentLevelIndex++;
            if (currentLevelIndex >= levelsData.length) {
              allLevelsComplete = true;
              showMessage("CONGRATULATIONS! HULK SMASHED ALL LEVELS!", true);
            } else {
              showMessage("LEVEL " + currentLevelIndex + " COMPLETE! Next level...", true);
            }
          }
          return true;
        }
      }
      return false;
    }
  }

  class Enemy {
    constructor(x, y, width, height, color, speed) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.color = color;
      this.speed = speed;
      this.direction = 1;
      this.patrolRange = 100;
      this.startX = x;
    }

    draw() {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
    }

    update() {
      // Simple patrol movement
      this.x += this.speed * this.direction;
      
      if (this.x > this.startX + this.patrolRange || this.x < this.startX - this.patrolRange) {
        this.direction *= -1;
      }
      
      // Check collision with hulk
      if (hulk.x < this.x + this.width && hulk.x + hulk.width > this.x &&
          hulk.y < this.y + this.height && hulk.y + hulk.height > this.y) {
        if (hulk.isSmashing) {
          // Enemy defeated
          this.y = -1000; // Move off-screen
          score += 25;
          updateUI();
        } else {
          takeDamage(10);
        }
      }
    }
  }

  // --- Level Definitions ---
  function defineLevels() {
    levelsData = [
      { // Level 1
        platforms: [
          { x: 0, y: canvas.height - 20, width: levelWidth, height: 20, color: '#888888' },
          { x: 200, y: canvas.height - 100, width: 150, height: 20, color: '#777777' },
          { x: 450, y: canvas.height - 180, width: 200, height: 20, color: '#666666' },
          { x: 700, y: canvas.height - 100, width: 100, height: 20, color: '#777777' },
          { x: 900, y: canvas.height - 250, width: 150, height: 20, color: '#555555' },
          { x: 1200, y: canvas.height - 150, width: 200, height: 20, color: '#666666' },
          { x: 1500, y: canvas.height - 80, width: 100, height: 20, color: '#777777' },
          { x: 1700, y: canvas.height - 200, width: 150, height: 20, color: '#555555' }
        ],
        smashableObjects: [
          { x: 250, y: canvas.height - 140, width: 30, height: 40, color: '#FF8C00', points: 10 },
          { x: 500, y: canvas.height - 220, width: 40, height: 40, color: '#A52A2A', points: 15 },
          { x: 720, y: canvas.height - 140, width: 30, height: 40, color: '#FF8C00', points: 10 },
          { x: 950, y: canvas.height - 290, width: 40, height: 40, color: '#A52A2A', points: 15 },
          { x: 1250, y: canvas.height - 190, width: 30, height: 40, color: '#FF8C00', points: 10 },
          { x: 1520, y: canvas.height - 120, width: 40, height: 40, color: '#A52A2A', points: 15 },
          { x: 1750, y: canvas.height - 240, width: 30, height: 40, color: '#FF8C00', points: 10 }
        ],
        enemies: [
          { x: 300, y: canvas.height - 60, width: 30, height: 40, color: '#FF0000', speed: 1 },
          { x: 600, y: canvas.height - 220, width: 30, height: 40, color: '#FF0000', speed: 1.5 },
          { x: 1000, y: canvas.height - 290, width: 30, height: 40, color: '#FF0000', speed: 1 },
          { x: 1300, y: canvas.height - 190, width: 30, height: 40, color: '#FF0000', speed: 1.2 }
        ],
        hulkStart: { x: 100, y: canvas.height - 80 }
      },
      { // Level 2
        platforms: [
          { x: 0, y: canvas.height - 20, width: levelWidth, height: 20, color: '#888888' },
          { x: 150, y: canvas.height - 120, width: 200, height: 20, color: '#707070' },
          { x: 400, y: canvas.height - 220, width: 150, height: 20, color: '#606060' },
          { x: 600, y: canvas.height - 150, width: 250, height: 20, color: '#707070' },
          { x: 900, y: canvas.height - 80, width: 100, height: 20, color: '#606060' },
          { x: 1100, y: canvas.height - 200, width: 180, height: 20, color: '#505050' },
          { x: 1400, y: canvas.height - 100, width: 200, height: 20, color: '#707070' },
          { x: 1650, y: canvas.height - 250, width: 200, height: 20, color: '#505050' }
        ],
        smashableObjects: [
          { x: 180, y: canvas.height - 160, width: 35, height: 35, color: '#FFA500', points: 12 },
          { x: 430, y: canvas.height - 260, width: 40, height: 40, color: '#B22222', points: 18 },
          { x: 700, y: canvas.height - 190, width: 35, height: 35, color: '#FFA500', points: 12 },
          { x: 920, y: canvas.height - 120, width: 40, height: 40, color: '#B22222', points: 18 },
          { x: 1150, y: canvas.height - 240, width: 35, height: 35, color: '#FFA500', points: 12 },
          { x: 1700, y: canvas.height - 290, width: 40, height: 40, color: '#B22222', points: 18 }
        ],
        enemies: [
          { x: 250, y: canvas.height - 60, width: 35, height: 35, color: '#DC143C', speed: 1.1 },
          { x: 500, y: canvas.height - 260, width: 35, height: 35, color: '#DC143C', speed: 1.6 },
          { x: 800, y: canvas.height - 190, width: 35, height: 35, color: '#FF4500', speed: 0.9 },
          { x: 1200, y: canvas.height - 240, width: 35, height: 35, color: '#DC143C', speed: 1.3 },
          { x: 1500, y: canvas.height - 140, width: 35, height: 35, color: '#FF4500', speed: 1 }
        ],
        hulkStart: { x: 50, y: canvas.height - 80 }
      }
    ];
  }

  // --- Utility Functions ---
  function showMessage(text, isLevelComplete = false) {
    if (!messageText || !messageBox || !messageButton) return;
    
    messageText.textContent = text;
    messageBox.classList.remove('hidden');
    messageBox.style.display = 'block';
    gameRunning = false;
    
    messageButton.onclick = () => {
      messageBox.style.display = 'none';
      if (isLevelComplete) {
        if (allLevelsComplete) {
          resetGame();
        } else {
          loadLevel();
        }
      } else {
        gameRunning = true;
        if (!gameLoopId) gameLoop();
      }
    };
  }

  function updateUI() {
    if (scoreDisplay) scoreDisplay.textContent = score;
    if (levelNumberDisplay) levelNumberDisplay.textContent = currentLevelIndex + 1;
    if (objectsToSmashDisplay) objectsToSmashDisplay.textContent = smashedCount;
    if (totalObjectsDisplay) totalObjectsDisplay.textContent = totalSmashableInLevel;
    if (healthDisplay) healthDisplay.textContent = health;
  }

  function takeDamage(amount) {
    if (!hulk.invulnerable) {
      health -= amount;
      if (health < 0) health = 0;
      updateUI();
      hulk.invulnerable = true;
      hulk.invulnerableTimer = hulk.invulnerableDuration;
      if (health <= 0) gameOver("Hulk defeated!");
    }
  }

  function gameOver(message) {
    gameRunning = false;
    showMessage(message + " Game Over! Click OK to restart.", true);
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
  }

  function resetGame() {
    currentLevelIndex = 0;
    score = 0;
    health = 100;
    allLevelsComplete = false;
    loadLevel();
  }

  function loadLevel() {
    // Clear existing objects
    platforms = [];
    smashableObjects = [];
    enemies = [];
    smashedCount = 0;
    levelComplete = false;
    
    // Get current level data
    const level = levelsData[currentLevelIndex];
    
    // Create platforms
    level.platforms.forEach(p => {
      platforms.push(new Platform(p.x, p.y, p.width, p.height, p.color));
    });
    
    // Create smashable objects
    level.smashableObjects.forEach(o => {
      smashableObjects.push(new SmashableObject(o.x, o.y, o.width, o.height, o.color, o.points));
    });
    
    // Create enemies
    level.enemies.forEach(e => {
      enemies.push(new Enemy(e.x, e.y, e.width, e.height, e.color, e.speed));
    });
    
    // Create hulk
    hulk = new Hulk(level.hulkStart.x, level.hulkStart.y);
    
    // Set total smashable objects
    totalSmashableInLevel = smashableObjects.length;
    
    // Update UI
    updateUI();
    
    // Start game
    gameRunning = true;
    if (!gameLoopId) gameLoop();
    
    // Show level message
    showMessage("LEVEL " + (currentLevelIndex + 1) + " - SMASH EVERYTHING!", false);
  }

  // --- Game Loop ---
  function gameLoop() {
    if (!gameRunning) {
      gameLoopId = requestAnimationFrame(gameLoop);
      return;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update camera position
    if (hulk.x > canvas.width / 2) {
      cameraX = Math.min(Math.max(0, hulk.x - canvas.width / 2), levelWidth - canvas.width);
    }
    
    // Draw background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw platforms
    platforms.forEach(platform => {
      platform.draw();
    });
    
    // Update and draw smashable objects
    smashableObjects.forEach(obj => {
      obj.draw();
      obj.checkSmash();
    });
    
    // Update and draw enemies
    enemies.forEach(enemy => {
      enemy.update();
      enemy.draw();
    });
    
    // Update and draw hulk
    hulk.update();
    hulk.draw();
    
    // Continue game loop
    gameLoopId = requestAnimationFrame(gameLoop);
  }

  // Initialize game
  function initGame() {
    // Set up canvas
    window.resizeGameCanvas();
    
    // Define levels
    defineLevels();
    
    // Load first level
    loadLevel();
  }

  // Start the game
  initGame();
};
