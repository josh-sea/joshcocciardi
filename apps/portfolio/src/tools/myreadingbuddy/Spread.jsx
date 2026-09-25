import React, { useEffect, useRef, useState } from "react";
import { fitBox, ratioOf } from "./book";

/* One photographed spread, and the page turn between two of them.

   A turn forward is built from three layers:
     - underneath, the spread being turned to, whole;
     - over its left half, the left half of the spread being left, which
       stays put like the page already read;
     - over the right half, a leaf hinged at the spine. Its front is the
       right half of the spread being left, its back is the left half of
       the spread being turned to, and it swings 180 degrees over to the
       left.
   A turn back is the mirror image. Every half is the full photo drawn at
   double width and shifted, so there is nothing to cut up ahead of time.

   `turn` is { from, to, dir } while a page is turning and null otherwise;
   `onTurned` fires once the leaf lands (and only for the leaf itself, not
   the shading on its faces, which finishes at the same moment). */

function Half({ page, side, className }) {
  return (
    <div
      className={`half ${className || ""}`}
      style={{
        backgroundImage: page?.image?.url ? `url("${page.image.url}")` : "none",
        backgroundPosition: side === "left" ? "0% 0%" : "100% 0%",
      }}
    />
  );
}

// The box the spread gets: as big as the stage allows at the photo's shape.
function useFit(ratio) {
  const stageRef = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => setBox(fitBox(el.clientWidth, el.clientHeight, ratio));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return [stageRef, box];
}

// A horizontal swipe on the stage turns the page. Taps fall through to the
// buttons underneath.
function useSwipe(onSwipe) {
  const start = useRef(null);
  return {
    onPointerDown: (e) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e) => {
      const s = start.current;
      start.current = null;
      if (!s || !onSwipe) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

export default function Spread({ pages, index, turn, onTurned, onSwipe, children }) {
  const current = pages[turn ? turn.from : index];
  const target = turn ? pages[turn.to] : null;
  const [stageRef, box] = useFit(ratioOf(current));
  const swipe = useSwipe(onSwipe);

  // Warm the cache for the neighbors so a turn never lands on a blank page.
  useEffect(() => {
    [index - 1, index + 1, index + 2].forEach((i) => {
      const url = pages[i]?.image?.url;
      if (url) new Image().src = url;
    });
  }, [pages, index]);

  // Land the turn exactly once: when the leaf's animation ends, or after a
  // grace period if it never reports (a backgrounded tab, a browser that
  // skips the animation), so the book can never get stuck mid-turn.
  const landed = useRef(null);
  const land = () => {
    if (!turn || landed.current === turn) return;
    landed.current = turn;
    onTurned();
  };
  const landRef = useRef(land);
  landRef.current = land;
  useEffect(() => {
    if (!turn) return undefined;
    const t = setTimeout(() => landRef.current(), 2000);
    return () => clearTimeout(t);
  }, [turn]);

  const fwd = turn && turn.dir > 0;

  return (
    <div className="stage" ref={stageRef} {...swipe}>
      {current && box.width > 0 && (
        <div className="spread" style={{ width: box.width, height: box.height }}>
          {!turn && <Half page={current} side="whole" className="whole" />}
          {turn && (
            <>
              <Half page={target} side="whole" className="whole" />
              <Half page={current} side={fwd ? "left" : "right"} className={fwd ? "still l" : "still r"} />
              <div className={`leaf ${fwd ? "fwd" : "bwd"}`} onAnimationEnd={(e) => e.target === e.currentTarget && land()}>
                <Half page={current} side={fwd ? "right" : "left"} className="face front" />
                <Half page={target} side={fwd ? "left" : "right"} className="face back" />
              </div>
            </>
          )}
          <div className="gutter" aria-hidden="true" />
          {children}
        </div>
      )}
    </div>
  );
}
