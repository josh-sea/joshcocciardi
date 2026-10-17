/**
 * Caddy — the wiring.
 *
 * One button carries the hole. Tap on the tee, play your shot, walk to the
 * ball, tap again: that logs the shot and sets up the next one. Everything
 * else — which club it actually was, where the shot really started and
 * finished, where the flag is — is editable afterwards, because fiddling
 * with a map while three people wait on you is not a thing anyone does.
 *
 * Distances come from par and the tee you are on until you drop a flag, at
 * which point the real measurement takes over.
 */

import { createStore, uuid } from "./store.js";
import {
  CLUB_CATALOG, STARTER_BAG, effectiveHandicap, playingDistance,
  lifetimeAverage, rollingAverage, bagWithMeasured, clubLabel,
} from "./clubs.js";
import { createMap } from "./map.js";
import { distance, pathLength, pointAlongPath, elevations, elevationAdjustmentYards, yards, metres, feet } from "./geo.js";
import { recommend, remainingYards, estimatedHoleYards } from "./caddy.js";

const $ = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

/* ---------------- state ---------------- */

const state = {
  profile: { skill: "beginner", handicap: null, avgScore: null, bestScore: null, prefer: "lifetime", voice: true },
  bag: [],
  round: null,
  shots: [],          // every shot in the round, oldest first
  tee: null,          // where this hole started
  ball: null,         // where the ball is now
  pin: null,
  waypoints: [],
  rise: null,
  dogleg: false,
  moving: null,       // "pin", or {shot: id, end: "from"|"to"}
  last: null,
};

let store = null;
let gmap = null;

const hole = () => Number($("holeNo").value) || 1;
const par = () => Number($("holePar").value) || 4;
const tee = () => $("teeColor").value || "White";
const handicap = () => effectiveHandicap(state.profile);
const distOpts = () => ({ prefer: state.profile.prefer });
const holeShots = () => state.shots.filter((s) => s.hole === hole());

/* ---------------- chrome ---------------- */

let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 5000);
}

function say(text) {
  if (!state.profile.voice || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch { /* some browsers refuse before a gesture */ }
}

function setSync() {
  const cloud = store?.signedIn?.();
  $("syncDot").className = `dot ${cloud ? "cloud" : "local"}`;
  $("syncText").textContent = cloud
    ? `Synced to ${store.currentUser()?.email || "your account"}`
    : store?.cloudReason
      ? `On this device only — ${store.cloudReason}`
      : "On this device only. Sign in and it follows you between phones.";
  const btn = $("authBtn");
  btn.hidden = !!store?.cloudReason;
  btn.textContent = cloud ? "Sign out" : "Sign in";
}

/* ---------------- geolocation ---------------- */

function here({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser will not share a location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(
        e.code === e.PERMISSION_DENIED
          ? "Location is blocked for this site. Allow it and try again."
          : e.code === e.TIMEOUT ? "Could not get a fix in time. Try again out in the open."
          : "Could not read your location.")),
      { enableHighAccuracy: true, timeout, maximumAge: 2000 }
    );
  });
}

/* ---------------- the bag ---------------- */

function defaultBag() {
  return CLUB_CATALOG.map((c) => ({ ...c, inBag: STARTER_BAG.includes(c.id) }));
}

/** The bag's own numbers are a projection of the shot log, so rebuild on any change. */
function refreshBag() {
  state.bag = bagWithMeasured(state.bag, state.shots, handicap());
  renderBag();
  renderLearned();
}

function renderBag() {
  const list = $("clubList");
  list.innerHTML = "";
  for (const club of state.bag) {
    const isPutter = club.id === "putter";
    const d = isPutter ? null : playingDistance(club, handicap(), distOpts());
    const row = document.createElement("div");
    row.className = `club${club.inBag ? "" : " out"}${isPutter ? " putter" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${club.inBag ? "checked" : ""} aria-label="${club.label} in the bag">
      <div><span class="name"></span><span class="src"></span></div>
      <div class="yds"></div>`;
    row.querySelector(".name").textContent = club.label;
    const src = row.querySelector(".src");
    if (isPutter) src.textContent = "On the green, you're on your own";
    else {
      src.textContent = d ? d.label : "";
      src.className = `src ${d?.source === "measured" ? "measured" : d?.source === "yours" ? "yours" : ""}`;
    }

    const yds = row.querySelector(".yds");
    if (!isPutter) {
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = "20";
      input.max = "400";
      input.placeholder = String(d?.yards ?? "");
      input.value = Number.isFinite(club.carryOverride) ? club.carryOverride : "";
      input.setAttribute("aria-label", `${club.label} distance in yards`);
      on(input, "change", async () => {
        const v = Number(input.value);
        club.carryOverride = Number.isFinite(v) && v > 0 ? v : null;
        await store.saveBag(state.bag);
        renderBag();
        updateCaddy();
      });
      const unit = document.createElement("small");
      unit.textContent = "yds";
      yds.append(input, unit);
    } else {
      yds.textContent = "—";
    }

    on(row.querySelector("input[type=checkbox]"), "change", async (e) => {
      club.inBag = e.target.checked;
      await store.saveBag(state.bag);
      renderBag();
      updateCaddy();
    });
    list.appendChild(row);
  }
}

function renderSkill() {
  const { skill } = state.profile;
  for (const b of $("skillSeg").children) b.setAttribute("aria-pressed", String(b.dataset.skill === skill));
  $("beginnerInputs").hidden = skill !== "beginner";
  $("handicapInputs").hidden = skill === "beginner";
  for (const b of $("preferSeg").children) b.setAttribute("aria-pressed", String(b.dataset.prefer === state.profile.prefer));
  const h = handicap();
  $("skillHint").textContent =
    skill === "beginner"
      ? `Starting distances are set for about a ${Math.round(h)} handicap, which is roughly three quarters of an average amateur with the longer clubs and less than that with the wedges. Log shots and these get replaced by your own.`
      : `Starting distances are interpolated from tracked-shot data for a ${Math.round(h)} handicap. Log shots and these get replaced by your own.`;
}

/* ---------------- the map, which is now optional ---------------- */

function targetPath() {
  if (!state.ball) return [];
  return [state.ball, ...state.waypoints, ...(state.pin ? [state.pin] : [])];
}

function redrawMarks() {
  if (!gmap) return;
  gmap.setBall(state.ball);
  gmap.setPin(state.pin);
  gmap.setPath(targetPath(), state.waypoints);
  renderMarks();
  setMapHint();
}

function renderMarks() {
  const row = $("marks");
  const chips = [];
  if (state.pin) chips.push(["pin", "🚩", "Flag"]);
  if (state.waypoints.length) {
    chips.push(["corners", "↳", `${state.waypoints.length} corner${state.waypoints.length === 1 ? "" : "s"}`]);
  }
  row.hidden = !chips.length;
  row.innerHTML = "";
  for (const [key, glyph, label] of chips) {
    const chip = document.createElement("span");
    chip.className = `chip${state.moving === key ? " arming" : ""}`;
    chip.innerHTML = `<span>${glyph}</span><b></b>` +
      (key === "corners" ? "" : `<button class="mv" type="button"></button>`) +
      `<button class="x" type="button"></button>`;
    chip.querySelector("b").textContent = label;
    const mv = chip.querySelector(".mv");
    if (mv) {
      mv.textContent = state.moving === key ? "cancel" : "move";
      on(mv, "click", () => {
        state.moving = state.moving === key ? null : key;
        if (state.moving) { state.dogleg = false; $("doglegBtn").setAttribute("aria-pressed", "false"); }
        renderMarks();
        setMapHint();
      });
    }
    const x = chip.querySelector(".x");
    x.textContent = "×";
    x.setAttribute("aria-label", `Remove ${label.toLowerCase()}`);
    on(x, "click", () => clearMark(key));
    row.appendChild(chip);
  }
}

function clearMark(which) {
  if (which === "pin") state.pin = null;
  else if (which === "corners") state.waypoints = [];
  if (state.moving === which) state.moving = null;
  state.rise = null;
  redrawMarks();
  updateCaddy();
}

function setMapHint() {
  const h = $("mapHint");
  if (typeof state.moving === "object" && state.moving) {
    h.hidden = false;
    h.innerHTML = `Tap where that shot <b>${state.moving.end === "from" ? "started" : "finished"}</b>.`;
  } else if (state.moving === "pin") {
    h.hidden = false;
    h.innerHTML = "Tap where the <b>flag</b> is.";
  } else if (state.dogleg) {
    h.hidden = false;
    h.innerHTML = "Tap each corner the ball has to go round, in order.";
  } else if (state.pin) {
    h.hidden = true;
  } else {
    h.hidden = false;
    h.innerHTML = "Tap the map where the flag is and the yardage stops being an estimate.";
  }
}

/* ---------------- what's left, and what to hit ---------------- */

/** Straight line from the tee to the ball: how much of the hole is behind you. */
function progressYards() {
  if (!state.tee || !state.ball) return 0;
  return yards(distance(state.tee, state.ball));
}

function updateCaddy() {
  const shots = holeShots();
  const started = !!state.ball;
  $("readout").hidden = !started;
  $("distSource").hidden = !started;
  $("shotLog").hidden = !started;
  $("caddyCard").hidden = !started;
  if (!started) { $("goHint").hidden = false; return; }
  $("goHint").hidden = true;

  const pinYards = state.pin ? yards(pathLength(targetPath())) : null;
  const left = remainingYards({
    par: par(), teeColor: tee(), pinYards, progressYards: progressYards(),
  });
  const riseYds = state.rise == null ? 0 : elevationAdjustmentYards(state.rise);

  $("distLeft").textContent = left.yards;
  $("distPlays").textContent = Math.max(0, Math.round(left.yards + riseYds));
  $("shotCount").textContent = shots.length;
  $("distSource").textContent =
    left.label + (state.rise == null ? "" : `. The green sits about ${Math.abs(Math.round(feet(state.rise)))} ft ${state.rise >= 0 ? "above" : "below"} you.`);

  const rec = recommend({
    yardsToTarget: left.yards,
    riseYards: riseYds,
    par: par(),
    shotNumber: shots.length + 1,
    bag: state.bag,
    handicap: handicap(),
    skill: state.profile.skill,
    distanceOpts: distOpts(),
  });
  state.last = rec;

  if (!rec.ok) {
    $("caddyClub").textContent = "No clubs yet";
    $("caddyYards").textContent = "--";
    $("caddySource").textContent = "";
    $("caddyStrategy").textContent = rec.reason;
    $("caddyAim").textContent = "";
    $("caddyNotes").innerHTML = "";
    return;
  }

  $("caddyClub").textContent = rec.clubLabel;
  $("caddyYards").textContent = `${rec.clubYards}y`;
  $("caddySource").textContent = rec.sourceLabel;
  $("caddyStrategy").textContent = rec.strategy;
  $("caddyAim").textContent = rec.aim;
  const notes = $("caddyNotes");
  notes.innerHTML = "";
  for (const n of rec.notes) {
    const li = document.createElement("li");
    li.textContent = n;
    notes.appendChild(li);
  }

  if (gmap && state.pin) {
    const aimAt = pointAlongPath(targetPath(), metres(rec.targetYards));
    gmap.setAim(aimAt);
    gmap.setAimLine(state.ball, aimAt);
  } else if (gmap) {
    gmap.setAim(null);
    gmap.setAimLine(null, null);
  }
}

/* ---------------- the one button ---------------- */

function setGoButton() {
  $("goBtn").textContent = state.ball ? "I'm at my ball" : "Start the hole";
}

async function go() {
  const btn = $("goBtn");
  btn.disabled = true;
  try {
    const p = await here();
    const point = { lat: p.lat, lng: p.lng };
    if (gmap) { gmap.showMe(p, p.accuracy); gmap.centerOn(p, 18); }
    if (p.accuracy > 15) toast(`Your phone only has you to about ${Math.round(p.accuracy)} m, so treat the yardage loosely.`);

    if (!state.ball) {
      state.tee = point;
      state.ball = point;
      redrawMarks();
      setGoButton();
      updateCaddy();
      renderShots();
      say(`Hole ${hole()}, par ${par()}.`);
      return;
    }

    const from = state.ball;
    const went = Math.round(yards(distance(from, point)));
    if (went < 5) {
      return toast("That's less than five yards from where you hit. Walk to the ball first, then tap.");
    }

    await ensureRound();
    const club = state.last?.ok ? state.last.club : null;
    const shot = await store.saveShot({
      id: uuid(),
      roundId: state.round.id,
      hole: hole(), par: par(), teeColor: tee(),
      shotNumber: holeShots().length + 1,
      club: club?.id || null,
      recommendedYards: state.last?.ok ? state.last.clubYards : null,
      from, to: point,
      yards: went,
      accuracy: p.accuracy,
      createdAt: Date.now(),
    });
    state.shots.push(shot);
    state.ball = point;
    state.waypoints = [];
    state.rise = null;

    redrawMarks();
    refreshBag();
    renderShots();
    updateCaddy();
    toast(`${went} yards${club ? ` with the ${club.label}` : ""}. Tap the club below if that wasn't it.`);
    say(`${went} yards.`);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    setGoButton();
  }
}

async function ensureRound() {
  if (state.round) return state.round;
  state.round = await store.saveRound({
    id: uuid(),
    course: $("courseName").value.trim() || "Unnamed course",
    teeColor: tee(),
    startedAt: Date.now(),
  });
  return state.round;
}

/* ---------------- the shot list, which is where editing happens ---------------- */

function renderShots() {
  const list = $("shotList");
  const shots = holeShots();
  list.innerHTML = "";
  for (const s of shots) {
    const li = document.createElement("li");
    li.className = "shot";
    const gap = Number.isFinite(s.recommendedYards) ? s.yards - s.recommendedYards : null;
    li.innerHTML = `
      <div class="shotmain">
        <select class="clubpick" aria-label="Club used"></select>
        <b class="yds"></b>
      </div>
      <div class="shotmeta"><span class="vs"></span></div>
      <div class="shotedit">
        <button class="btn ghost tiny" data-end="from">Fix start</button>
        <button class="btn ghost tiny" data-end="to">Fix end</button>
        <button class="btn ghost tiny danger" data-del="1">Delete</button>
      </div>`;

    const pick = li.querySelector(".clubpick");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "No club";
    pick.appendChild(none);
    for (const c of state.bag.filter((c) => c.inBag !== false)) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.label;
      pick.appendChild(o);
    }
    pick.value = s.club || "";
    on(pick, "change", async () => {
      s.club = pick.value || null;
      await store.saveShot(s);
      refreshBag();
      renderShots();
      updateCaddy();
    });

    li.querySelector(".yds").textContent = `${s.yards} yds`;
    li.querySelector(".vs").textContent =
      gap === null ? "" : `caddy said ${s.recommendedYards} · you went ${gap >= 0 ? "+" : ""}${gap}`;

    for (const b of li.querySelectorAll("[data-end]")) {
      on(b, "click", () => {
        state.moving = { shot: s.id, end: b.dataset.end };
        state.dogleg = false;
        $("mapBox").open = true;
        gmap?.invalidate();
        setMapHint();
        renderMarks();
        toast(`Tap the map where that shot ${b.dataset.end === "from" ? "started" : "finished"}.`);
      });
    }
    on(li.querySelector("[data-del]"), "click", () => deleteShot(s.id));
    list.appendChild(li);
  }
}

/** Keep each shot starting where the last one finished. */
function relinkHole() {
  const shots = holeShots();
  shots.forEach((s, i) => {
    if (i > 0) s.from = shots[i - 1].to;
    s.shotNumber = i + 1;
    s.yards = Math.round(yards(distance(s.from, s.to)));
  });
  state.tee = shots[0]?.from || state.tee;
  state.ball = shots[shots.length - 1]?.to || state.tee;
  return shots;
}

async function commitHole(shots) {
  for (const s of shots) await store.saveShot(s);
  redrawMarks();
  refreshBag();
  renderShots();
  updateCaddy();
}

async function moveShotEnd(shotId, end, point) {
  const s = state.shots.find((x) => x.id === shotId);
  if (!s) return;
  s[end] = point;
  await commitHole(relinkHole());
  toast(`Shot re-measured: ${s.yards} yards.`);
}

async function deleteShot(id) {
  const s = state.shots.find((x) => x.id === id);
  if (!s) return;
  state.shots = state.shots.filter((x) => x.id !== id);
  await store.deleteShot(id);
  const shots = relinkHole();
  if (!shots.length) { state.ball = state.tee; }
  await commitHole(shots);
}

/* ---------------- history ---------------- */

function renderLearned() {
  const el = $("learned");
  const taught = state.bag.filter((c) => (c.measured?.count || 0) > 0);
  if (!taught.length) {
    el.innerHTML = `<p class="empty-note">Nothing logged yet. Play a hole and the numbers start landing here.</p>`;
    return;
  }
  const rows = taught.map((c) => {
    const est = playingDistance({ ...c, carryOverride: null, measured: { count: 0, sum: 0, recent: [] } }, handicap());
    const rej = c.measured.rejected || 0;
    return `<tr>
      <td>${c.label}</td>
      <td class="num">${c.measured.count}${rej ? ` <span class="rej">+${rej}?</span>` : ""}</td>
      <td class="num">${est?.yards ?? "—"}</td>
      <td class="num measured">${lifetimeAverage(c)}</td>
      <td class="num">${rollingAverage(c) ?? "—"}</td>
    </tr>`;
  }).join("");
  el.innerHTML = `<table>
    <thead><tr><th>Club</th><th class="num">Shots</th><th class="num">Estimate</th><th class="num">Lifetime</th><th class="num">Last 5</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="hint" style="margin-top:10px">Estimate is what the chart predicted for your skill level. Lifetime and last five are yours, measured ground to ground, so they include roll. A number in orange is a shot held back as an unlikely mark.</p>`;
}

async function renderRounds() {
  const el = $("rounds");
  const rounds = await store.listRounds();
  if (!rounds.length) { el.innerHTML = `<p class="empty-note">No rounds yet.</p>`; return; }
  const all = await store.listShots();
  el.innerHTML = rounds.map((r) => {
    const mine = all.filter((s) => s.roundId === r.id);
    const holes = new Set(mine.map((s) => s.hole)).size;
    const when = new Date(r.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `<div class="roundrow"><div>${r.course}<br><span>${when} · ${r.teeColor} tees</span></div><div>${mine.length} shot${mine.length === 1 ? "" : "s"}<br><span>${holes} hole${holes === 1 ? "" : "s"}</span></div></div>`;
  }).join("");
}

/* ---------------- boot ---------------- */

async function load() {
  const [profile, bag, shots] = await Promise.all([store.getProfile(), store.getBag(), store.listShots()]);
  if (profile) state.profile = { ...state.profile, ...profile };
  state.shots = shots || [];
  const saved = bag?.length
    ? CLUB_CATALOG.map((c) => ({ ...c, ...(bag.find((b) => b.id === c.id) || { inBag: STARTER_BAG.includes(c.id) }) }))
    : defaultBag();
  state.bag = saved;
  if (!bag?.length) await store.saveBag(state.bag);
  $("voiceBtn").setAttribute("aria-pressed", String(state.profile.voice !== false));
  if (Number.isFinite(state.profile.avgScore)) $("avgScore").value = state.profile.avgScore;
  if (Number.isFinite(state.profile.bestScore)) $("bestScore").value = state.profile.bestScore;
  if (Number.isFinite(state.profile.handicap)) $("handicap").value = state.profile.handicap;
  renderSkill();
  refreshBag();
  renderShots();
  await renderRounds();
  setGoButton();
  updateCaddy();
}

const saveProfile = () => store.saveProfile(state.profile);

function wireTabs() {
  on($("tabs"), "click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    for (const b of $("tabs").children) b.setAttribute("aria-pressed", String(b === btn));
    for (const name of ["play", "bag", "history"]) $(`tab-${name}`).hidden = name !== btn.dataset.tab;
    if (btn.dataset.tab === "play") gmap?.invalidate();
    if (btn.dataset.tab === "history") { renderLearned(); renderRounds(); }
  });
}

async function main() {
  if (typeof L === "undefined") {
    $("map").innerHTML =
      `<div class="maploadfail"><strong>The map could not load.</strong>` +
      `<span>Leaflet is served from a CDN and this network did not hand it over. ` +
      `The hole, the caddy and your history all still work — you just cannot drop a flag.</span></div>`;
    store = await createStore();
    setSync();
    await load();
    wireTabs();
    wireRest();
    return;
  }

  store = await createStore();
  gmap = createMap($("map"), {
    onMapTap(point) {
      if (typeof state.moving === "object" && state.moving) {
        const { shot, end } = state.moving;
        state.moving = null;
        moveShotEnd(shot, end, point);
        return;
      }
      if (state.moving === "pin") { state.pin = point; state.moving = null; }
      else if (state.dogleg) state.waypoints.push(point);
      else state.pin = point;
      state.rise = null;
      redrawMarks();
      updateCaddy();
    },
    onCornerTap(index) {
      state.waypoints.splice(index, 1);
      state.rise = null;
      redrawMarks();
      updateCaddy();
    },
  });
  gmap.invalidate();

  store.onAuth?.(async (user) => {
    setSync();
    if (user) { try { await store.adoptLocal(); } catch (e) { console.warn("[Caddy] adopt failed:", e.message); } }
    await load();
  });
  setSync();
  await load();

  here({ timeout: 8000 })
    .then((p) => { gmap.showMe(p, p.accuracy); gmap.centerOn(p, 16); })
    .catch(() => { /* they can start the hole and it will ask again */ });

  wireTabs();
  wireRest();
}

function wireRest() {
  on($("goBtn"), "click", go);
  on($("speakBtn"), "click", () => state.last?.ok && say(state.last.spoken));

  for (const [id, delta] of [["prevHoleBtn", -1], ["nextHoleBtn", 1]]) {
    on($(id), "click", () => {
      const next = Math.max(1, Math.min(36, hole() + delta));
      $("holeNo").value = String(next);
      startFreshHole();
    });
  }
  on($("holeNo"), "change", startFreshHole);
  for (const id of ["holePar", "teeColor"]) on($(id), "change", updateCaddy);

  on($("pinHereBtn"), "click", async () => {
    try {
      const p = await here();
      state.pin = { lat: p.lat, lng: p.lng };
      state.rise = null;
      gmap?.showMe(p, p.accuracy);
      redrawMarks();
      updateCaddy();
    } catch (e) { toast(e.message); }
  });
  on($("doglegBtn"), "click", () => {
    state.dogleg = !state.dogleg;
    if (state.dogleg) state.moving = null;
    $("doglegBtn").setAttribute("aria-pressed", String(state.dogleg));
    renderMarks();
    setMapHint();
  });
  on($("undoCornerBtn"), "click", () => {
    if (!state.waypoints.length) return toast("No corners to undo.");
    state.waypoints.pop();
    state.rise = null;
    redrawMarks();
    updateCaddy();
  });
  on($("elevBtn"), "click", checkElevation);
  on($("layerBtn"), "click", () => {
    const now = gmap.setLayer(gmap.layer === "satellite" ? "street" : "satellite");
    $("layerBtn").textContent = now === "satellite" ? "🛰️" : "🗺️";
  });
  on($("locateBtn"), "click", async () => {
    try { const p = await here(); gmap.showMe(p, p.accuracy); gmap.centerOn(p, 18); }
    catch (e) { toast(e.message); }
  });
  on($("mapBox"), "toggle", () => gmap?.invalidate());

  on($("skillSeg"), "click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.profile.skill = btn.dataset.skill;
    await saveProfile();
    renderSkill(); refreshBag(); updateCaddy();
  });
  on($("preferSeg"), "click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.profile.prefer = btn.dataset.prefer;
    await saveProfile();
    renderSkill(); refreshBag(); updateCaddy();
  });
  for (const [id, key] of [["avgScore", "avgScore"], ["bestScore", "bestScore"], ["handicap", "handicap"]]) {
    on($(id), "change", async () => {
      const v = Number($(id).value);
      state.profile[key] = Number.isFinite(v) && $(id).value !== "" ? v : null;
      await saveProfile();
      renderSkill(); refreshBag(); updateCaddy();
    });
  }

  on($("voiceBtn"), "click", async () => {
    state.profile.voice = !(state.profile.voice !== false);
    $("voiceBtn").setAttribute("aria-pressed", String(state.profile.voice));
    if (!state.profile.voice) window.speechSynthesis?.cancel();
    await saveProfile();
  });
  on($("authBtn"), "click", async () => {
    try {
      if (store.signedIn()) await store.signOut();
      else await store.signInGoogle();
    } catch (e) { toast(e.message); }
    setSync();
  });
  on($("exportBtn"), "click", async () => {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      bag: state.bag,
      rounds: await store.listRounds(),
      shots: await store.listShots(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `caddy-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  on($("resetBtn"), "click", async () => {
    if (!confirm("Clear the bag, rounds and shots stored on this device? If you're signed in, the copy in your account stays.")) return;
    try { localStorage.removeItem("swingcoach.caddy.v1"); } catch {}
    location.reload();
  });
}

/** Moving to another hole starts its own tee, ball and flag from nothing. */
function startFreshHole() {
  const shots = holeShots();
  state.tee = shots[0]?.from || null;
  state.ball = shots[shots.length - 1]?.to || null;
  state.pin = null;
  state.waypoints = [];
  state.rise = null;
  state.moving = null;
  redrawMarks();
  setGoButton();
  renderShots();
  updateCaddy();
}

async function checkElevation() {
  const path = targetPath();
  if (path.length < 2) return toast("Drop a flag first — elevation needs two points.");
  try {
    $("elevBtn").disabled = true;
    const [ballEl, pinEl] = await elevations([path[0], path[path.length - 1]]);
    state.rise = pinEl - ballEl;
    updateCaddy();
    const ft = Math.round(feet(state.rise));
    toast(Math.abs(ft) < 3
      ? "The green is about level with you."
      : `The green sits about ${Math.abs(ft)} ft ${ft > 0 ? "above" : "below"} you, so it plays ${ft > 0 ? "longer" : "shorter"}.`);
  } catch (e) {
    toast(`Could not look up the elevation: ${e.message}`);
  } finally {
    $("elevBtn").disabled = false;
  }
}

main().catch((e) => {
  console.error(e);
  const t = document.getElementById("toast");
  t.textContent = `The caddy failed to start: ${e.message}`;
  t.classList.add("show");
});
