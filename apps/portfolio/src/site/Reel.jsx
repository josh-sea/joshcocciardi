import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, SmartLink } from "./ui";
import { isExternal } from "./data";
import "./reel.css";

/* --------------------------------------------------------------------------
   A stereo viewer reel that turns as you scroll.

   A reel has 14 windows in a ring: 7 frames, each printed twice on opposite
   sides of the disc. A viewer looks through the windows at 3 and 9 o'clock,
   one per eye, so turning the reel by 360/14 degrees brings the next pair in.
   The copy at 9 o'clock is printed upside down so that it reads upright once
   it's behind the left lens.

   Each lens holds a magnified clone of the same disc, turned by the same
   angle, so a frame slides into the lens the way it would in the real thing.

   Scrolling through the section drives the angle. The section is tall and the
   stage is sticky, so the page holds still while the reel turns. Snap points
   (one per frame) settle it on a frame; the lever and the number keys jump.
   -------------------------------------------------------------------------- */

const WINDOWS = 14;
const STEP_DEG = 360 / WINDOWS;
const RING = 0.7; // window centers sit at 0.70 R
const WINDOW = 0.27; // window size, in R
const LENS = 0.6; // lens diameter, in R
const MAG = (LENS / WINDOW) * 0.96; // lens magnification
const FRAME_VH = 70; // scroll distance per frame, in vh

const Disc = React.forwardRef(({ frames, R, label, style, className = "" }, ref) => {
  const arcId = `reel-arc-${React.useId().replace(/:/g, "")}`;
  return (
  <div
    ref={ref}
    className={`reel-disc ${className}`}
    style={{ "--R": `${R}px`, ...style }}
    aria-hidden="true"
  >
    <svg className="reel-print" viewBox="0 0 200 200">
      <defs>
        <path id={arcId} d="M 100 100 m -36 0 a 36 36 0 1 1 72 0 a 36 36 0 1 1 -72 0" />
      </defs>
      <text fontSize="7.2" letterSpacing="1.6">
        <textPath href={`#${arcId}`}>{label}</textPath>
      </text>
      {Array.from({ length: WINDOWS }, (_, j) => {
        const a = j * STEP_DEG;
        return (
          <text
            key={j}
            fontSize="7"
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${a} 100 100) translate(${100 + 92} 100) rotate(90)`}
          >
            {(j % frames.length) + 1}
          </text>
        );
      })}
    </svg>
    {Array.from({ length: WINDOWS }, (_, j) => {
      const f = frames[j % frames.length];
      const flip = j >= WINDOWS / 2 ? " rotate(180deg)" : "";
      return (
        <div
          key={j}
          className="reel-window"
          style={{ transform: `rotate(${j * STEP_DEG}deg) translateX(calc(var(--R) * ${RING}))${flip}` }}
        >
          <img src={f.frame} alt="" draggable="false" />
        </div>
      );
    })}
  </div>
  );
});

const useReelRadius = (stageRef) => {
  const [R, setR] = useState(160);
  useLayoutEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const wide = vw >= 860;
      // Width: the toy is 2.5 R wide (2.6 with the lever and some slack).
      const byWidth = wide ? Math.min(560, (Math.min(vw, 1120) - 56) * 0.55) / 2.6 : (vw - 32) / 2.6;
      // Height: on a phone the shelf and caption sit under the toy (~330px).
      const byHeight = wide ? (vh - 120) / 2.25 : (vh - 64 - 350) / 2.2;
      setR(Math.max(96, Math.floor(Math.min(byWidth, byHeight, 230))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [stageRef]);
  return R;
};

// A tiny reel for the shelf: paper, a ring of dark windows, a center hole.
const MiniReel = () => <span className="mini-reel" aria-hidden="true" />;

const Reel = ({ reels }) => {
  const [reelIdx, setReelIdx] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const reel = reels[reelIdx];
  const frames = reel.frames;
  const n = frames.length;
  const label = `JOSH COCCIARDI · REEL ${reelIdx + 1} · ${reel.name.toUpperCase()} ·`;
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const discRef = useRef(null);
  const lensL = useRef(null);
  const lensR = useRef(null);
  const [active, setActive] = useState(0);
  const [headerH, setHeaderH] = useState(64);
  const [leverDown, setLeverDown] = useState(false);
  const R = useReelRadius(stageRef);

  const L = LENS * R;
  const sR = R * MAG;
  const lensPos = (side) => ({
    left: L / 2 + side * RING * sR - sR,
    top: L / 2 - sR,
  });

  // Scroll snapping only while the reel is on the page.
  useEffect(() => {
    document.documentElement.classList.add("reel-snap");
    const h = document.querySelector(".site-header");
    if (h) setHeaderH(h.offsetHeight);
    return () => document.documentElement.classList.remove("reel-snap");
  }, []);

  const stepPx = () => (window.innerHeight * FRAME_VH) / 100;

  // Scroll → angle. Written straight to the DOM; React only hears about it
  // when the frame in the lenses changes.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el) return;
      const scrolled = headerH - el.getBoundingClientRect().top;
      const p = Math.min(n - 1, Math.max(0, scrolled / stepPx()));
      const t = `rotate(${-p * STEP_DEG}deg)`;
      if (discRef.current) discRef.current.style.transform = t;
      if (lensL.current) lensL.current.style.transform = t;
      if (lensR.current) lensR.current.style.transform = t;
      const i = Math.round(p);
      setActive((prev) => (prev === i ? prev : i));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [n, headerH, R, reelIdx]);

  const goTo = useCallback(
    (i) => {
      const el = sectionRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - headerH + i * stepPx();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    },
    [headerH]
  );

  // Load another reel: it drops into the viewer and starts on frame 1.
  const load = (i) => {
    if (i === reelIdx) return;
    setSwapped(true);
    setReelIdx(i);
    const el = sectionRef.current;
    if (el && active > 0) {
      const top = el.getBoundingClientRect().top + window.scrollY - headerH;
      window.scrollTo({ top, behavior: "instant" });
    }
  };

  const pull = () => {
    setLeverDown(true);
    setTimeout(() => setLeverDown(false), 160);
    goTo(active + 1 >= n ? 0 : active + 1);
  };

  const f = frames[active];
  const stageH = `calc(100vh - ${headerH}px)`;

  return (
    <section
      ref={sectionRef}
      className="reel-scroll"
      style={{ height: `calc(${stageH} + ${(n - 1) * FRAME_VH}vh)` }}
      aria-label="Featured projects"
    >
      {frames.map((fr, i) => (
        <span
          key={fr.id}
          className="reel-snap-point"
          style={{ top: `${i * FRAME_VH}vh`, scrollMarginTop: headerH }}
        />
      ))}

      <div ref={stageRef} className="reel-stage" style={{ top: headerH, minHeight: stageH }}>
        <div className="reel-toy" style={{ "--R": `${R}px` }}>
          <div
            key={reel.id}
            className={`reel-drop${swapped ? " is-dropping" : ""}`}
            style={{ left: 0.25 * R, top: 0.04 * R }}
          >
            <Disc ref={discRef} frames={frames} R={R} label={label} />
          </div>
          <div className="viewer-body" />
          <span className="viewer-plate" aria-hidden="true">
            {reel.name}
          </span>
          <div className="viewer-lens viewer-lens--l">
            <Disc
              key={reel.id}
              ref={lensL}
              className={`lens-disc${swapped ? " is-dropping" : ""}`}
              frames={frames}
              R={sR}
              label={label}
              style={lensPos(1)}
            />
          </div>
          <div className="viewer-lens viewer-lens--r">
            <Disc
              key={reel.id}
              ref={lensR}
              className={`lens-disc${swapped ? " is-dropping" : ""}`}
              frames={frames}
              R={sR}
              label={label}
              style={lensPos(-1)}
            />
          </div>
          <button
            type="button"
            className={`viewer-lever${leverDown ? " is-down" : ""}`}
            onClick={pull}
          >
            <span>Next frame</span>
          </button>
        </div>

        <div className="reel-caption">
          <div className="reel-shelf" role="group" aria-label="Choose a reel">
            {reels.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className="key shelf-reel"
                aria-pressed={i === reelIdx}
                onClick={() => load(i)}
              >
                <MiniReel />
                {r.name}
              </button>
            ))}
          </div>
          <div aria-live="polite">
          <span className="reel-count">
            {reel.name} reel · frame {active + 1} of {n} · {f.kindLabel}
          </span>
          <h3>{f.title}</h3>
          <p>{f.blurb}</p>
          <span className="reel-host">{f.host}</span>
          <div className="reel-actions">
            <SmartLink to={f.link} className="key key--blue">
              {isExternal(f.link) ? "Visit" : "Open"} {f.title} <Icon name="arrow" size={14} />
            </SmartLink>
          </div>
          <div className="reel-jump" role="group" aria-label="Jump to frame">
            {frames.map((fr, i) => (
              <button
                key={fr.id}
                type="button"
                className="key key--small"
                aria-pressed={i === active}
                aria-label={`Frame ${i + 1}: ${fr.title}`}
                onClick={() => goTo(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="reel-hint">Scroll to turn the reel, pull the lever, or load another reel.</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Reel;
