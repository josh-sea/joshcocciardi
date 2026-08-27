import { useState, useCallback } from 'react';
import { speakWord } from '../../services/tts.service';

// One tappable word. Tap → hear just this word. It lights up while it speaks.
const Word = ({ text }) => {
  const [speaking, setSpeaking] = useState(false);

  const handleTap = useCallback(() => {
    speakWord(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }, [text]);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTap(); } }}
      className={`word${speaking ? ' is-speaking' : ''}`}
    >
      {text}
    </span>
  );
};

export default Word;
