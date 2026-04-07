import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../App.css';

const HulkGame = () => {
  const canvasRef = useRef(null);
  const gameContainerRef = useRef(null);

  useEffect(() => {
    // Load the game script
    const script = document.createElement('script');
    script.src = '/hulkGame.js';
    script.async = true;
    document.body.appendChild(script);

    // Initialize the game when the script is loaded
    script.onload = () => {
      if (window.initHulkGame) {
        window.initHulkGame();
      }
    };

    // Set up event listeners for keyboard controls
    const handleKeyDown = (e) => {
      if (!window.gameKeys) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          window.gameKeys.left = true;
          break;
        case 'ArrowRight':
          window.gameKeys.right = true;
          break;
        case 'ArrowUp':
          window.gameKeys.up = true;
          break;
        case 'ArrowDown':
          window.gameKeys.down = true;
          break;
        case ' ':
          window.gameKeys.space = true;
          e.preventDefault();
          break;
        case 'g':
        case 'G':
          window.gameKeys.g = true;
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (e) => {
      if (!window.gameKeys) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          window.gameKeys.left = false;
          break;
        case 'ArrowRight':
          window.gameKeys.right = false;
          break;
        case 'ArrowUp':
          window.gameKeys.up = false;
          break;
        case 'ArrowDown':
          window.gameKeys.down = false;
          break;
        case ' ':
          window.gameKeys.space = false;
          break;
        case 'g':
        case 'G':
          window.gameKeys.g = false;
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Handle window resize
    const handleResize = () => {
      if (window.resizeGameCanvas) {
        window.resizeGameCanvas();
      }
    };

    window.addEventListener('resize', handleResize);

    // Clean up
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="hulk-game-page">
      <div className="game-header">
        <h1>Hulk Smash Game</h1>
        <Link to="/" className="back-button">Back to Projects</Link>
      </div>
      
      <div className="game-container" ref={gameContainerRef}>
        <div className="game-ui">
          <div className="game-stats">
            <div>Score: <span id="score">0</span></div>
            <div>Level: <span id="levelNumber">1</span></div>
            <div>Smashed: <span id="objectsToSmash">0</span>/<span id="totalObjects">0</span></div>
            <div>Health: <span id="health">100</span></div>
          </div>
        </div>
        
        <canvas id="gameCanvas" ref={canvasRef} width="800" height="600"></canvas>
        
        <div id="messageBox" className="message-box hidden">
          <div id="messageText" className="message-text"></div>
          <button id="messageButton" className="message-button">OK</button>
        </div>
      </div>
      
      <div className="game-instructions">
        <h2>How to Play</h2>
        <ul>
          <li>Arrow Keys: Move Hulk</li>
          <li>Space: Smash</li>
          <li>Space + Down: Ground Pound (destroys platforms)</li>
          <li>G: Grab/Throw objects and enemies</li>
          <li>Up: Jump (double jump available)</li>
        </ul>
        <p>Smash all the objects to complete each level!</p>
      </div>
    </div>
  );
};

export default HulkGame;
