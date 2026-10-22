// Pure-helper tests for My Reading Buddy: picking a recording format every
// device can play back, sizing a spread to the screen, page order edits,
// page-turn direction, and ordering photos from a picker. No dependencies
// and no emulator:
//
//   cd apps/portfolio
//   node test/readingbuddy.test.mjs

import {
  VIDEO_TIMING,
  baseType,
  buildTimeline,
  easeInOut,
  fitRect,
  leafStrips,
  pickVideoType,
  segmentAt,
  videoExt,
  videoFileName,
  clampIndex,
  clock,
  coverOf,
  extFor,
  firstUnrecorded,
  fitBox,
  hasAudio,
  isReadable,
  movePage,
  newId,
  orderFiles,
  pickAudioType,
  ratioOf,
  recordedCount,
  removePage,
  setPageAudio,
  shrinkTo,
  turnDir,
} from "../src/tools/myreadingbuddy/book.js";

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    pass++;
    console.log("  PASS", label);
  } else {
    fail++;
    console.log("  FAIL", label, "\n    got ", a, "\n    want", b);
  }
};

console.log("recording formats:");
const safari = (t) => t.startsWith("audio/mp4");
const oldChrome = (t) => t.startsWith("audio/webm");
const firefox = (t) => t.startsWith("audio/ogg") || t.startsWith("audio/webm");
eq("Safari records AAC in MP4", pickAudioType(safari), "audio/mp4;codecs=mp4a.40.2");
eq("MP4 wins whenever it's offered, so any device can play it back", pickAudioType(() => true), "audio/mp4;codecs=mp4a.40.2");
eq("a browser with only WebM records Opus in WebM", pickAudioType(oldChrome), "audio/webm;codecs=opus");
eq("Firefox takes WebM before Ogg", pickAudioType(firefox), "audio/webm;codecs=opus");
eq("no match leaves the choice to the browser", pickAudioType(() => false), "");
eq("a support check that throws counts as unsupported", pickAudioType(() => { throw new Error("x"); }), "");
eq("no MediaRecorder at all", pickAudioType(undefined), "");
eq("codecs are stripped for Storage", baseType("audio/webm;codecs=opus"), "audio/webm");
eq("file extensions", ["audio/mp4", "audio/webm;codecs=opus", "audio/ogg", "image/jpeg", "x/y"].map(extFor), ["m4a", "webm", "ogg", "jpg", "bin"]);

console.log("\nclock:");
eq("seconds pad to two digits", [clock(0), clock(9.4), clock(83), clock(600)], ["0:00", "0:09", "1:23", "10:00"]);
eq("junk reads as zero", [clock(undefined), clock(-4), clock("x")], ["0:00", "0:00", "0:00"]);

console.log("\nsizing:");
eq("a wide spread on a wide screen fills the height", fitBox(1200, 600, 1.5), { width: 900, height: 600 });
eq("a wide spread on a phone in portrait fills the width", fitBox(390, 700, 1.5), { width: 390, height: 260 });
eq("a missing ratio falls back to a typical spread", fitBox(700, 1000, 0), { width: 700, height: 500 });
eq("an unmeasured stage draws nothing", fitBox(0, 500, 1.4), { width: 0, height: 0 });
eq("photos shrink to the long edge", shrinkTo(4032, 3024, 2400), { w: 2400, h: 1800 });
eq("portrait photos too", shrinkTo(3024, 4032, 2400), { w: 1800, h: 2400 });
eq("small photos are never enlarged", shrinkTo(1600, 1200, 2400), { w: 1600, h: 1200 });
eq("a page's ratio comes from its photo", ratioOf({ image: { w: 2400, h: 1600 } }), 1.5);
eq("a page with no size gets the fallback", ratioOf({ image: {} }), 1.4);

console.log("\npages:");
const a = { id: "a", image: { url: "A" }, audio: { url: "a.m4a" } };
const b = { id: "b", image: { url: "B" }, audio: null };
const c = { id: "c", image: { url: "C" }, audio: null };
const pages = [a, b, c];
eq("hasAudio", pages.map(hasAudio), [true, false, false]);
eq("recordedCount", recordedCount(pages), 1);
eq("the recorder opens at the first page without a voice", firstUnrecorded(pages), 1);
eq("a fully recorded book opens the recorder at the start", firstUnrecorded([a]), 0);
eq("an empty book opens at the start", firstUnrecorded([]), 0);
eq("move down", movePage(pages, "a", 1).map((p) => p.id), ["b", "a", "c"]);
eq("move up", movePage(pages, "c", -1).map((p) => p.id), ["a", "c", "b"]);
eq("the first page can't move up", movePage(pages, "a", -1), pages);
eq("the last page can't move down", movePage(pages, "c", 1), pages);
eq("an unknown page doesn't move anything", movePage(pages, "z", 1), pages);
eq("moving doesn't touch the original", pages.map((p) => p.id), ["a", "b", "c"]);
eq("remove", removePage(pages, "b").map((p) => p.id), ["a", "c"]);
eq("set a page's audio", setPageAudio(pages, "b", { url: "b.m4a" }).map(hasAudio), [true, true, false]);
eq("a book with pages is readable", isReadable({ pages }), true);
eq("an empty book isn't on the kids' shelf", [isReadable({ pages: [] }), isReadable({}), isReadable(null)], [false, false, false]);
eq("the cover is the first spread", coverOf({ pages }), "A");
eq("no pages, no cover", coverOf({ pages: [] }), null);
eq("clampIndex keeps the reader on a real page", [clampIndex(5, 3), clampIndex(-1, 3), clampIndex(1, 3), clampIndex(2, 0)], [2, 0, 1, 0]);

console.log("\nturning:");
eq("forward", turnDir(0, 1, 3), 1);
eq("back", turnDir(2, 1, 3), -1);
eq("skipping ahead still turns forward", turnDir(0, 2, 3), 1);
eq("no turn past the last page", turnDir(2, 3, 3), 0);
eq("no turn before the cover", turnDir(0, -1, 3), 0);
eq("no turn to the same page", turnDir(1, 1, 3), 0);

console.log("\nphoto order:");
const f = (name) => ({ name });
eq("numbered scans sort by their numbers, not as text", orderFiles([f("page 10.jpg"), f("page 2.jpg"), f("page 1.jpg")]).map((x) => x.name), ["page 1.jpg", "page 2.jpg", "page 10.jpg"]);
eq("camera roll names sort by their counter", orderFiles([f("IMG_4412.JPG"), f("IMG_4410.JPG"), f("IMG_4411.JPG")]).map((x) => x.name), ["IMG_4410.JPG", "IMG_4411.JPG", "IMG_4412.JPG"]);
eq("the last number wins, so dates in names don't matter", orderFiles([f("2026-09-25 scan 3.png"), f("2026-09-25 scan 1.png")]).map((x) => x.name), ["2026-09-25 scan 1.png", "2026-09-25 scan 3.png"]);
eq("without numbers on every file, the picked order stands", orderFiles([f("cover.jpg"), f("b.jpg"), f("a 1.jpg")]).map((x) => x.name), ["cover.jpg", "b.jpg", "a 1.jpg"]);
eq("nothing picked", orderFiles(null), []);

console.log("\nids:");
const ids = new Set(Array.from({ length: 500 }, newId));
eq("ids are 12 url-safe characters", /^[a-z0-9]{12}$/.test(newId()), true);
eq("and don't collide", ids.size, 500);

console.log("\nvideo format:");
const iphone = (t) => t.startsWith("video/mp4");
const chromeNow = () => true;
const chromeOld = (t) => t.startsWith("video/webm");
eq("Safari makes H.264 + AAC in MP4", pickVideoType(iphone), "video/mp4;codecs=avc1.42E01E,mp4a.40.2");
eq("MP4 wins whenever it's offered, so phones can save it", pickVideoType(chromeNow), "video/mp4;codecs=avc1.42E01E,mp4a.40.2");
eq("a browser with only WebM gets VP9 + Opus", pickVideoType(chromeOld), "video/webm;codecs=vp9,opus");
eq("nothing supported leaves it to the browser", pickVideoType(() => false), "");
eq("extensions follow the container", [videoExt("video/mp4;codecs=avc1"), videoExt("video/webm;codecs=vp9"), videoExt("")], ["mp4", "webm", "webm"]);
eq("file name carries the title and reader", videoFileName({ title: "Goodnight Moon", readBy: "Bodhi" }, "video/mp4"), "Goodnight Moon - read by Bodhi.mp4");
eq("no reader, just the title", videoFileName({ title: "Hop on Pop", readBy: "" }, "video/webm"), "Hop on Pop.webm");
eq("characters phones refuse are taken out", videoFileName({ title: 'Cat/Hat: "Two"?', readBy: "Mom" }, "video/mp4"), "Cat Hat Two - read by Mom.mp4");
eq("an untitled book still gets a name", videoFileName({}, "video/mp4"), "My book.mp4");

console.log("\nvideo timeline:");
const T = VIDEO_TIMING;
const tl = buildTimeline([4, 0, 2.5]);
eq("title, page, turn, page, turn, page, end", tl.segments.map((s) => s.kind), ["title", "page", "flip", "page", "flip", "page", "end"]);
eq("segments run back to back", tl.segments.every((s, i) => i === 0 || Math.abs(s.start - (tl.segments[i - 1].start + tl.segments[i - 1].dur)) < 1e-9), true);
const close = (a, b) => Math.abs(a - b) < 1e-9;
eq("total is every part added up", close(tl.total, T.title + (T.lead + 4 + T.tail) + T.flip + T.silent + T.flip + (T.lead + 2.5 + T.tail) + T.end), true);
eq("a recorded page starts its voice after a short lead", close(tl.segments[1].voiceAt, T.title + T.lead), true);
eq("a page with no voice holds for a few seconds, silently", [tl.segments[3].voiceAt, close(tl.segments[3].dur, T.silent)], [null, true]);
eq("turns go page to page", tl.segments.filter((s) => s.kind === "flip").map((s) => `${s.from}->${s.to}`), ["0->1", "1->2"]);
eq("a one-page book has no turns", buildTimeline([3]).segments.map((s) => s.kind), ["title", "page", "end"]);
eq("at time 0, the title", segmentAt(tl, 0).seg.kind, "title");
eq("halfway through the first turn", [segmentAt(tl, tl.segments[2].start + T.flip / 2).seg.kind, Math.round(segmentAt(tl, tl.segments[2].start + T.flip / 2).p * 100)], ["flip", 50]);
eq("past the end holds on The End", [segmentAt(tl, tl.total + 5).seg.kind, segmentAt(tl, tl.total + 5).p], ["end", 1]);
eq("easing starts and ends still and meets in the middle", [easeInOut(0), easeInOut(0.5), easeInOut(1)], [0, 0.5, 1]);

console.log("\npage turn geometry:");
const flat = leafStrips(0, 100, 10);
eq("flat on the right: front face, strips tile 0..100", [flat.face, Math.round(flat.strips[0].x), Math.round(flat.strips.at(-1).x + flat.strips.at(-1).width)], ["front", 0, 100]);
eq("flat on the right: no perspective", flat.strips.every((s) => close(s.scale, 1)), true);
const lifted = leafStrips(Math.PI / 3, 100, 10);
eq("lifting: the far edge looks taller than the spine edge", lifted.strips.at(-1).scale > lifted.strips[0].scale, true);
eq("lifting: foreshortened, so narrower than flat", lifted.strips.at(-1).x + lifted.strips.at(-1).width < 100, true);
const over = leafStrips((2 * Math.PI) / 3, 100, 10);
eq("past upright the back shows, lying to the left", [over.face, over.strips.every((s) => s.x <= 0)], ["back", true]);
const landed = leafStrips(Math.PI, 100, 10);
eq("landed flat on the left", [Math.round(Math.min(...landed.strips.map((s) => s.x))), landed.strips.every((s) => Math.abs(s.scale - 1) < 1e-9)], [-100, true]);
eq("a 16:9 frame fits a 3:2 spread by height, centered", fitRect(1280, 720, 1.5, 36), { x: 154, y: 36, w: 972, h: 648 });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
