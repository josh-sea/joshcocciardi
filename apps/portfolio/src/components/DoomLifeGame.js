import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../App.css';

const DoomLifeGame = () => {
  useEffect(() => {
    // Redirect to the HTML file in the public folder
    window.location.href = '/doomLifeGame.html';
  }, []);

  return (
    <div className="game-page">
      <div className="game-header">
        <h1>Conway's DOOM - Loading...</h1>
        <Link to="/" className="back-button">Back to Projects</Link>
      </div>
      
      <div className="game-container">
        <p>Loading Conway's DOOM...</p>
        <p>If the game doesn't load automatically, <a href="/doomLifeGame.html">click here</a>.</p>
      </div>
      
      <div className="game-instructions">
        <h2>Conway's DOOM</h2>
        <p>A unique fusion of Conway's Game of Life and first-person shooter mechanics!</p>
        <ul>
          <li>Arrow Keys: Move and turn</li>
          <li>Space: Shoot walls</li>
          <li>R: Restart level</li>
          <li>Navigate to the magenta/yellow finish area</li>
          <li>Watch out for evolving patterns that can damage you!</li>
        </ul>
      </div>
    </div>
  );
};

export default DoomLifeGame;
