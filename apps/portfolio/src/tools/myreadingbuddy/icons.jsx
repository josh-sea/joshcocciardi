import React from "react";

// Inline icons, sized by their container, colored by currentColor.
const Svg = ({ children, ...rest }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" {...rest}>
    {children}
  </svg>
);

export const PlayIcon = () => (
  <Svg>
    <path fill="currentColor" d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2Z" />
  </Svg>
);

export const PauseIcon = () => (
  <Svg>
    <rect fill="currentColor" x="6" y="4.5" width="4.2" height="15" rx="1.3" />
    <rect fill="currentColor" x="13.8" y="4.5" width="4.2" height="15" rx="1.3" />
  </Svg>
);

export const PrevIcon = () => (
  <Svg>
    <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
  </Svg>
);

export const NextIcon = () => (
  <Svg>
    <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </Svg>
);

export const HomeIcon = () => (
  <Svg>
    <path
      fill="currentColor"
      d="M11.3 3.3a1 1 0 0 1 1.4 0l8 7.6a1 1 0 0 1-.7 1.7H18.5V19a1.5 1.5 0 0 1-1.5 1.5h-3v-5h-4v5H7A1.5 1.5 0 0 1 5.5 19v-6.4H4a1 1 0 0 1-.7-1.7l8-7.6Z"
    />
  </Svg>
);

export const MicIcon = () => (
  <Svg>
    <rect fill="currentColor" x="8.5" y="2.5" width="7" height="12" rx="3.5" />
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
);

export const StopIcon = () => (
  <Svg>
    <rect fill="currentColor" x="6" y="6" width="12" height="12" rx="2.5" />
  </Svg>
);
