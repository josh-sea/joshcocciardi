/* ------------------------------------------------------------------ */
/*  My Reading Buddy: a book as a video                                */
/*                                                                     */
/*  Everything happens in the browser. Each page's photo and voice are */
/*  read into memory, a canvas draws the book frame by frame (title,   */
/*  each spread while its voice plays, a page turn, …, The End), and   */
/*  MediaRecorder captures the canvas plus the voices as one file. It  */
/*  records in real time, so a three minute book takes three minutes.  */
/*                                                                     */
/*  The audio clock drives the picture: every frame asks the           */
/*  AudioContext what time it is and draws that moment, so the pages   */
/*  can never drift away from the voices however frames are dropped.   */
/* ------------------------------------------------------------------ */

import { buildTimeline, easeInOut, fitRect, hasAudio, leafStrips, pickVideoType, segmentAt } from "./book";
import { readFile } from "./store";

export const VIDEO_W = 1280;
export const VIDEO_H = 720;

const NIGHT = "#1B1E3A";
const PAPER = "#FFF8EC";
const BERRY = "#E4572E";

const AudioCtx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;

export const canMakeVideo = () =>
  typeof window !== "undefined" &&
  typeof window.MediaRecorder !== "undefined" &&
  !!AudioCtx &&
  typeof HTMLCanvasElement !== "undefined" &&
  typeof HTMLCanvasElement.prototype.captureStream === "function";

export const videoType = () => pickVideoType((t) => window.MediaRecorder.isTypeSupported(t));

// Has to be created inside the tap that starts the export: iOS only lets
// sound play from a context a person started.
export const newAudioContext = () => {
  const ctx = new AudioCtx();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
};

// Nothing here may wait forever: a stuck step becomes an error the screen
// can show, not a progress bar that never moves.
const within = (ms, promise, message) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

const loadImage = (blob) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("A page photo couldn't be read."));
    };
    img.src = url;
  });

const decode = (ctx, blob) =>
  blob.arrayBuffer().then(
    (buf) =>
      new Promise((resolve, reject) => {
        // The callback form is the one older Safari supports.
        const p = ctx.decodeAudioData(buf, resolve, reject);
        if (p && typeof p.then === "function") p.then(resolve, reject);
      })
  );

/* Read every photo and recording into memory. `onProgress(done, total)`.
   A recording that won't decode becomes a silent page rather than
   stopping the whole video. */
export const prepareBook = async (ctx, book, onProgress, signal) => {
  const pages = book.pages;
  const total = pages.length;
  const images = [];
  const voices = [];
  let skipped = 0;
  for (let i = 0; i < total; i += 1) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const p = pages[i];
    images.push(await within(30000, loadImage(await readFile(p.image)), `Page ${i + 1}'s photo couldn't be read.`));
    let voice = null;
    if (hasAudio(p)) {
      try {
        voice = await within(30000, decode(ctx, await readFile(p.audio)), "decode timed out");
      } catch (e) {
        console.warn("[readingbuddy] couldn't decode page", i + 1, e);
        skipped += 1;
      }
    }
    voices.push(voice);
    onProgress?.(i + 1, total);
  }
  const timeline = buildTimeline(voices.map((v) => (v ? v.duration : 0)));
  return { images, voices, timeline, skipped };
};

export const releaseBook = (prepared) =>
  prepared?.images.forEach((img) => img.src.startsWith("blob:") && URL.revokeObjectURL(img.src));

/* ----------------------------- drawing ----------------------------- */

const ratioOfImage = (img) => (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.4);

const background = (g) => {
  const grad = g.createRadialGradient(VIDEO_W / 2, VIDEO_H * 0.4, 60, VIDEO_W / 2, VIDEO_H * 0.4, VIDEO_W * 0.75);
  grad.addColorStop(0, "#262A4F");
  grad.addColorStop(1, NIGHT);
  g.fillStyle = grad;
  g.fillRect(0, 0, VIDEO_W, VIDEO_H);
};

// Room around the spread for the turning page to rise into: with the
// camera LEAF_DIST page-widths away, the lifted edge grows to at most
// LEAF_DIST / (LEAF_DIST - 1) of its height (7/6 here), which still fits.
const LEAF_DIST = 7;
const spreadRect = (img) => fitRect(VIDEO_W, VIDEO_H, ratioOfImage(img), 56);

// One half of a photo (or all of it) into part of the frame.
const half = (g, img, side, dx, dy, dw, dh) => {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (side === "whole") g.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
  else g.drawImage(img, side === "left" ? 0 : iw / 2, 0, iw / 2, ih, dx, dy, dw, dh);
};

const shadowed = (g, r, fn) => {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 40;
  g.shadowOffsetY = 14;
  g.fillStyle = "#fff";
  g.fillRect(r.x, r.y, r.w, r.h);
  g.restore();
  fn();
};

const gutter = (g, r) => {
  const cx = r.x + r.w / 2;
  const grad = g.createLinearGradient(cx - 22, 0, cx + 22, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.16)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(cx - 22, r.y, 44, r.h);
};

const drawSpread = (g, img) => {
  const r = spreadRect(img);
  shadowed(g, r, () => half(g, img, "whole", r.x, r.y, r.w, r.h));
  gutter(g, r);
};

/* A forward page turn, in strips (see leafStrips in book.js). Underneath:
   the next spread whole, with the current spread's left half still lying
   on the left. On top: the leaf, showing the current right half until it
   passes upright and the next left half after. */
const drawTurn = (g, from, to, p) => {
  const r = spreadRect(from);
  const hw = r.w / 2;
  const spine = r.x + hw;
  const cy = r.y + r.h / 2;
  shadowed(g, r, () => {
    half(g, to, "whole", r.x, r.y, r.w, r.h);
    half(g, from, "left", r.x, r.y, hw, r.h);
  });

  const theta = easeInOut(p) * Math.PI;
  // Thin strips, so the rising edge reads as a smooth slope, not steps.
  const { strips, face } = leafStrips(theta, hw, 120, LEAF_DIST);
  const img = face === "front" ? from : to;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const lift = Math.sin(theta);

  // The shadow the lifted page casts on the page it's uncovering.
  g.save();
  g.globalAlpha = 0.35 * lift;
  const sx = face === "front" ? spine : spine - hw;
  const sg = g.createLinearGradient(spine, 0, face === "front" ? spine + hw : spine - hw, 0);
  sg.addColorStop(0, "rgba(0,0,0,0.6)");
  sg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sg;
  g.fillRect(sx, r.y, hw, r.h);
  g.restore();

  strips.forEach((s) => {
    const h = r.h * s.scale;
    const dy = cy - h / 2;
    const dx = spine + s.x - 0.3; // +0.6px overlap hides hairline seams
    const dw = s.width + 0.6;
    // Front face: the right half of `from`, spine at its left edge.
    // Back face: the left half of `to`, spine at its right edge.
    const srcX = face === "front" ? iw / 2 + (s.u0 * iw) / 2 : iw / 2 - (s.u1 * iw) / 2;
    const srcW = ((s.u1 - s.u0) * iw) / 2;
    g.drawImage(img, srcX, 0, srcW, ih, dx, dy, dw, h);
  });

  // Light falls off as the page tips toward upright. Filled once over the
  // leaf's own outline (top edge out, bottom edge back), so only the page
  // darkens and the overlapping strips don't stripe.
  if (lift > 0.02) {
    const edge = (sign) =>
      strips.flatMap((s) => [
        [spine + s.x, cy + (sign * r.h * s.scale) / 2],
        [spine + s.x + s.width, cy + (sign * r.h * s.scale) / 2],
      ]);
    const outline = [...edge(-1), ...edge(1).reverse()];
    g.save();
    g.globalAlpha = 0.28 * lift;
    g.fillStyle = "#000";
    g.beginPath();
    outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.restore();
  }
  gutter(g, r);
};

const fade = (g, alpha) => {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, alpha);
  g.fillStyle = NIGHT;
  g.fillRect(0, 0, VIDEO_W, VIDEO_H);
  g.restore();
};

const card = (g, lines) => {
  g.save();
  g.fillStyle = "rgba(27,30,58,0.62)";
  g.fillRect(0, 0, VIDEO_W, VIDEO_H);
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach(({ text, font, color, y }) => {
    g.font = font;
    g.fillStyle = color;
    g.fillText(text, VIDEO_W / 2, y, VIDEO_W - 120);
  });
  g.restore();
};

const TITLE_FONT = "600 68px Fredoka, 'Trebuchet MS', sans-serif";
const BY_FONT = "700 34px Nunito, 'Trebuchet MS', sans-serif";

export const loadFonts = () =>
  Promise.all([TITLE_FONT, BY_FONT].map((f) => document.fonts?.load?.(f).catch(() => null))).catch(() => null);

/* Draw the frame at video time t. */
export const drawFrame = (g, book, prepared, t) => {
  const { images, timeline } = prepared;
  const at = segmentAt(timeline, t);
  background(g);
  if (!at) return;
  const { seg, p } = at;
  const elapsed = p * seg.dur;
  if (seg.kind === "title") {
    drawSpread(g, images[0]);
    card(g, [
      { text: book.title, font: TITLE_FONT, color: PAPER, y: VIDEO_H / 2 - (book.readBy ? 24 : 0) },
      ...(book.readBy ? [{ text: `read by ${book.readBy}`, font: BY_FONT, color: "#F6AE2D", y: VIDEO_H / 2 + 46 }] : []),
    ]);
    fade(g, 1 - elapsed / 0.5); // fade in from dark
    fade(g, (elapsed - (seg.dur - 0.4)) / 0.4 / 2); // dip a little into the first page
  } else if (seg.kind === "page") {
    drawSpread(g, images[seg.index]);
  } else if (seg.kind === "flip") {
    drawTurn(g, images[seg.from], images[seg.to], p);
  } else {
    drawSpread(g, images[images.length - 1]);
    card(g, [{ text: "The End", font: TITLE_FONT, color: BERRY, y: VIDEO_H / 2 }]);
    fade(g, (elapsed - (seg.dur - 0.6)) / 0.6); // fade out
  }
};

/* ----------------------------- recording --------------------------- */

/* Play the book once into a recorder. Resolves with { blob, type } when
   the last frame is captured, or rejects with an AbortError if `signal`
   fires. `onTick(t, total)` reports progress about ten times a second.
   `monitor` decides whether the voices also come out of the speaker
   (they're recorded either way). `onPoster(dataUrl)` gets one still of
   the cover card, for showing the finished video before it plays (it
   opens on a fade from dark, so its own first frame is black). */
export const recordBook = ({ canvas, ctx, book, prepared, monitor = true, onTick, onPoster, signal }) =>
  new Promise((resolve, reject) => {
    const g = canvas.getContext("2d");
    canvas.width = VIDEO_W;
    canvas.height = VIDEO_H;
    const { timeline, voices } = prepared;

    const dest = ctx.createMediaStreamDestination();
    const speaker = ctx.createGain();
    speaker.gain.value = monitor ? 1 : 0;
    speaker.connect(ctx.destination);

    const video = canvas.captureStream(30);
    const tracks = [...video.getVideoTracks(), ...dest.stream.getAudioTracks()];
    const type = videoType();
    let rec;
    try {
      rec = new window.MediaRecorder(new MediaStream(tracks), {
        ...(type ? { mimeType: type } : {}),
        videoBitsPerSecond: 5_000_000,
        audioBitsPerSecond: 128_000,
      });
    } catch (e) {
      reject(e);
      return;
    }

    const chunks = [];
    const sources = [];
    let raf = 0;
    let lastTick = -1;
    let finished = false;
    let postered = false;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      sources.forEach((s) => {
        try {
          s.stop();
        } catch (e) {
          /* never started */
        }
      });
      speaker.disconnect();
      video.getTracks().forEach((tr) => tr.stop());
    };

    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.onerror = (e) => {
      cleanup();
      reject(e.error || new Error("The recording stopped unexpectedly."));
    };
    rec.onstop = () => {
      cleanup();
      if (signal?.aborted) reject(new DOMException("Cancelled", "AbortError"));
      else resolve({ blob: new Blob(chunks, { type: rec.mimeType || type || "video/webm" }), type: rec.mimeType || type });
    };

    const stop = () => {
      if (finished) return;
      finished = true;
      if (rec.state !== "inactive") rec.stop();
    };
    signal?.addEventListener("abort", stop, { once: true });

    drawFrame(g, book, prepared, 0);
    rec.start(1000);

    // A short lead so the recorder is running before anything happens.
    const t0 = ctx.currentTime + 0.3;
    timeline.segments.forEach((seg) => {
      const buf = seg.kind === "page" ? voices[seg.index] : null;
      if (!buf || seg.voiceAt == null) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.connect(speaker);
      src.start(t0 + seg.voiceAt);
      sources.push(src);
    });

    const frame = () => {
      const t = Math.max(0, ctx.currentTime - t0);
      // Redraw every frame, even when nothing moves, so the video track
      // keeps a steady frame rate through a long still page.
      drawFrame(g, book, prepared, t);
      if (!postered && t >= 1.2) {
        postered = true;
        try {
          onPoster?.(canvas.toDataURL("image/jpeg", 0.8));
        } catch (e) {
          /* a poster is a nicety */
        }
      }
      if (t - lastTick >= 0.1) {
        lastTick = t;
        onTick?.(Math.min(t, timeline.total), timeline.total);
      }
      if (t >= timeline.total + 0.2) {
        // One more beat so the last frame lands in the file.
        setTimeout(stop, 250);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
