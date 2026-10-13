// Swipe right = "Got paid", swipe left = "Hold". A shortcut only: the row
// always shows the same actions as big buttons, and the swipe layers are
// hidden from screen readers.

import { useRef, useState, type ReactNode } from 'react';

export function SwipeRow({ children, onRight, onLeft, rightLabel, leftLabel }: {
  children: ReactNode;
  onRight?: () => void;
  onLeft?: () => void;
  rightLabel: string;
  leftLabel: string;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; locked: boolean | null } | null>(null);
  const width = useRef(1);

  const reset = () => {
    start.current = null;
    setDx(0);
  };

  return (
    <div className="swipe">
      <div className={`under ${dx >= 0 ? 'right' : 'left'}`} aria-hidden="true">
        {dx >= 0 ? <span>✓ {rightLabel}</span> : <span>{leftLabel}</span>}
      </div>
      <div
        className={`top${start.current ? ' dragging' : ''}`}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button, a, input')) return;
          width.current = e.currentTarget.getBoundingClientRect().width || 1;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: null };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (s.locked === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
            s.locked = Math.abs(mx) > Math.abs(my);
            if (s.locked) e.currentTarget.setPointerCapture(e.pointerId);
          }
          if (!s.locked) return;
          if ((mx > 0 && !onRight) || (mx < 0 && !onLeft)) return;
          setDx(mx);
        }}
        onPointerUp={() => {
          const frac = dx / width.current;
          reset();
          if (frac > 0.35) onRight?.();
          else if (frac < -0.35) onLeft?.();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}
