import { useCallback, useRef } from 'react';

// Fires onLongPress after a stationary press (touch or mouse) and lets the
// caller suppress the click that would otherwise follow. Spread `handlers` onto
// the element; gate its onClick with `didLongPress()`.
export const useLongPress = (onLongPress, { delay = 450, moveTolerance = 12 } = {}) => {
  const timer = useRef(null);
  const fired = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onStart = useCallback(
    (e) => {
      fired.current = false;
      const p = e.touches ? e.touches[0] : e;
      start.current = { x: p.clientX, y: p.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress(e);
      }, delay);
    },
    [onLongPress, delay]
  );

  const onMove = useCallback(
    (e) => {
      const p = e.touches ? e.touches[0] : e;
      if (Math.abs(p.clientX - start.current.x) > moveTolerance ||
          Math.abs(p.clientY - start.current.y) > moveTolerance) {
        clear();
      }
    },
    [clear, moveTolerance]
  );

  const didLongPress = useCallback(() => fired.current, []);

  return {
    handlers: {
      onTouchStart: onStart,
      onTouchMove: onMove,
      onTouchEnd: clear,
      onMouseDown: onStart,
      onMouseMove: onMove,
      onMouseUp: clear,
      onMouseLeave: clear,
    },
    didLongPress,
  };
};
