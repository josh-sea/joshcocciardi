import { getPersonalityPrompt, setPersonalityMode } from './personality_mode';

// Example function to set the mode dynamically
export const setMode = (mode) => {
  setPersonalityMode(mode);
};

// Function to create prompt with personality - now takes personality mode as parameter
export const createPromptWithPersonality = (userInput, personalityMode = 'default') => {
  const personalityPrompt = getPersonalityPrompt(personalityMode);
  return [
    { role: 'system', content: `You are an AI assistant. ${personalityPrompt}` },
    { role: 'user', content: userInput }
  ];
};
