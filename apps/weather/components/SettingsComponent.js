// SettingsComponent.js
import React, { useState, useEffect } from 'react';
import { setMode } from './integrate_personality';

const modes = [
  { label: 'Default', value: 'default' },
  { label: 'Snarky', value: 'snarky' },
  { label: 'Merica', value: 'merica' },
  { label: 'Marvin', value: 'marvin' },
  { label: 'Silly', value: 'silly' },
  { label: 'Dad Joke', value: 'dad_joke' },
  { label: 'Pride', value: 'pride' },
];

const SettingsComponent = () => {
  const [selectedMode, setSelectedMode] = useState('default');

  useEffect(() => {
    // Optionally, load saved mode from local storage
    const savedMode = localStorage.getItem('personalityMode') || 'default';
    setSelectedMode(savedMode);
    setMode(savedMode);
  }, []);

  const handleChange = (e) => {
    const mode = e.target.value;
    setSelectedMode(mode);
    setMode(mode);
    localStorage.setItem('personalityMode', mode); // Save selection
  };

  return (
    <div>
      <label htmlFor="personalitySelect">Select Personality Mode:</label>
      <select id="personalitySelect" value={selectedMode} onChange={handleChange}>
        {modes.map((mode) => (
          <option key={mode.value} value={mode.value}>{mode.label}</option>
        ))}
      </select>
    </div>
  );
};

export default SettingsComponent;