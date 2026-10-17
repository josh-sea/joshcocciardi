/**
 * Caddy — the wiring.
 *
 * The shape of a hole: you stand at your ball, you say where you are going,
 * and the caddy reads the distance off the map and picks a club. When you hit,
 * you mark where it finished, which both advances the hole and teaches the bag
 * one more real number about that club.
 */

import { createStore, uuid } from "./store.js";
import {
  CLUB_CATALOG, STARTER_BAG, effectiveHandicap, playingDistance, recordShot, believableShot,
  lifetimeAverage, rollingAverage,
} from "./clubs.js";
import { createMap } from "./map.js";
import { distance, pathLength, pointAlongPath, elevations, elevationAdjustmentYards, yards, metres, feet } from "./geo.js";
import { recommend } from "./caddy.js";

const $ = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

/* ---------------- state ---------------- */

const state = {
  profile: { skill: "beginner", handicap: null, avgScore: null, bestScore: null, prefer: "lifetime", voice: true },
  bag: [],
  round: null,
  shots: [],            // shots in the current round
  ball: null,           // {lat,lng}
  pin: null,
  waypoints: [],        // extra dogleg corners between ball and pin
  rise: null,           // metres the pin sits above the ball, or null if unchecked
  dogleg: false,
  last: null,           // the last recommendation shown
  watchId: null,
};

let store = null;
let gmap = null;

/* ---------------- chrome ---------------- */

let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4800);
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

/* ---------------- the bag ---------------- */

function defaultBag() {
  return CLUB_CATALOG.map((c) => ({ ...c, inBag: STARTER_BAG.includes(c.id), measured: { count: 0, sum: 0, recent: [] } }));
}

const handicap = () => effectiveHandicap(state.profile);
const distOpts = () => ({ prefer: state.profile.prefer });

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

/* ---------------- distances and the recommendation ---------------- */

function targetPath() {
  if (!state.ball) return [];
  return [state.ball, ...state.waypoints, ...(state.pin ? [state.pin] : [])];
}

function updateReadout() {
  const path = targetPath();
  const have = path.length >= 2;
  $("readout").hidden = !have;
  if (!have) { $("caddyCard").hidden = true; gmap.setAimLine(null, null); gmap.setAim(null); return;}

  const flat = yards(pathLength(path));
  const riseYds = state.rise == null ? 0 : elevationAdjustmentYards(state.rise);
  $("distFlat").textContent = Math.round(flat);
  $("distPlays").textContent = Math.round(flat + riseYds);
  $("distRise").textContent = state.rise == null ? "—" : `${state.rise >= 0 ? "+" : "−"}${Math.abs(Math.round(feet(state.rise)))} ft`;

  const rec = recommend({
    yardsToTarget: flat,
    riseYards: riseYds,
    par: Number($("holePar").value) || 4,
    shotNumber: Number($("shotNo").value) || 1,
    bag: state.bag,
    handicap: handicap(),
    skill: state.profile.skill,
    distanceOpts: distOpts(),
  });
  state.last = rec;

  const card = $("caddyCard");
  if (!rec.ok) {
    card.hidden = false;
    $("caddyClub").textContent = "No clubs yet";
    $("caddyYards").textContent = "--";
    $("caddySource").textContent = "";
    $("caddyStrategy").textContent = rec.reason;
    $("caddyAim").textContent = "";
    $("caddyNotes").innerHTML = "";
    return;
  }

  card.hidden = false;
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

  // Put the aim marker where the ball should finish, measured along the line
  // you traced, so a dogleg aims at the corner rather than through the trees.
  const aimAt = pointAlongPath(path, metres(rec.targetYards));
  gmap.setAim(aimAt);
  gmap.setAimLine(state.ball, aimAt);
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
          : e.code === e.TIMEOUT ? "Could not get a fix in time. Try again in the open."
          : "Could not read your location.")),
      { enableHighAccuracy: true, timeout, maximumAge: 2000 }
    );
  });
}

async function markHere(what) {
  try {
    const p = await here();
    gmap.showMe(p, p.accuracy);
    if (what === "ball") { state.ball = { lat: p.lat, lng: p.lng }; gmap.setBall(state.ball); }
    else { state.pin = { lat: p.lat, lng: p.lng }; gmap.setPin(state.pin); }
    state.rise = null;
    gmap.centerOn(p, 18);
    if (p.accuracy > 15) toast(`Your phone only has you to about ${Math.round(p.accuracy)} m, so treat the yardage loosely.`);
    $("mapHint").hidden = !!(state.ball && state.pin);
    updateReadout();
  } catch (e) {
    toast(e.message);
  }
}

async function checkElevation() {
  const path = targetPath();
  if (path.length < 2) return toast("Mark your ball and the flag first.");
  try {
    $("elevBtn").disabled = true;
    const [ballEl, pinEl] = await elevations([path[0], path[path.length - 1]]);
    state.rise = pinEl - ballEl;
    updateReadout();
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

/* ---------------- playing a hole ---------------- */

async function ensureRound() {
  if (state.round) return state.round;
  state.round = await store.saveRound({
    id: uuid(),
    course: $("courseName").value.trim() || "Unnamed course",
    teeColor: $("teeColor").value,
    startedAt: Date.now(),
    shots: 0,
  });
  return state.round;
}

async function hitIt() {
  if (!state.ball) return toast("Mark where your ball is first.");
  const rec = state.last;
  let landed;
  try {
    landed = await here();
  } catch (e) {
    return toast(`${e.message} Walk to the ball and try again, or tap the map where it finished.`);
  }

  const from = state.ball;
  const to = { lat: landed.lat, lng: landed.lng };
  const wentYards = Math.round(yards(distance(from, to)));

  if (wentYards < 5) {
    return toast("That's less than five yards from where you hit it. Walk to the ball first, then tap this.");
  }

  await ensureRound();
  const club = rec?.ok ? rec.club : null;
  const shot = await store.saveShot({
    id: uuid(),
    roundId: state.round.id,
    hole: Number($("holeNo").value) || 1,
    par: Number($("holePar").value) || 4,
    teeColor: $("teeColor").value,
    shotNumber: Number($("shotNo").value) || 1,
    club: club?.id || null,
    clubLabel: club?.label || null,
    recommendedYards: rec?.ok ? rec.clubYards : null,
    playsLike: rec?.ok ? rec.playsLike : null,
    from, to,
    yards: wentYards,
    accuracy: landed.accuracy,
    createdAt: Date.now(),
  });
  state.shots.push(shot);

  // Teach the bag, but only from a shot that could plausibly be this club.
  let rejected = null;
  if (club && club.id !== "putter" && wentYards >= 25) {
    const i = state.bag.findIndex((c) => c.id === club.id);
    if (i >= 0) {
      const expected = playingDistance(state.bag[i], handicap(), distOpts())?.yards;
      const verdict = believableShot(wentYards, expected);
      if (verdict.ok) {
        state.bag[i] = recordShot(state.bag[i], wentYards);
        await store.saveBag(state.bag);
        renderBag();
      } else {
        rejected = verdict.why;
      }
    }
  }

  // The ball is where you now stand, and you're one shot further along.
  state.ball = to;
  state.waypoints = [];
  state.rise = null;
  gmap.setBall(to);
  gmap.setWaypoints([]);
  gmap.showMe(landed, landed.accuracy);
  $("shotNo").value = String((Number($("shotNo").value) || 1) + 1);

  renderShots();
  updateReadout();

  if (rejected) {
    toast(`Logged ${wentYards} yards, but not added to your ${club.label} average: ${rejected}. Check you marked the right spot.`);
  } else {
    const vs = rec?.ok ? ` The caddy had that club at ${rec.clubYards}.` : "";
    toast(`${wentYards} yards with the ${club?.label || "club"}.${vs}`);
  }
  say(`${wentYards} yards.`);
}

function renderShots() {
  const list = $("shotList");
  const mine = state.shots.filter((s) => s.hole === (Number($("holeNo").value) || 1));
  $("shotLog").hidden = !mine.length;
  list.innerHTML = "";
  for (const s of mine) {
    const li = document.createElement("li");
    const gap = Number.isFinite(s.recommendedYards) ? s.yards - s.recommendedYards : null;
    li.innerHTML = `<b></b> <span class="vs"></span>`;
    li.querySelector("b").textContent = `${s.clubLabel || "Club"} — ${s.yards} yds`;
    li.querySelector(".vs").textContent =
      gap === null ? "" : `(caddy said ${s.recommendedYards}, you went ${gap >= 0 ? "+" : ""}${gap})`;
    list.appendChild(li);
  }
}

/* ---------------- history ---------------- */

function renderLearned() {
  const el = $("learned");
  const taught = state.bag.filter((c) => (c.measured?.count || 0) > 0);
  if (!taught.length) {
    el.innerHTML = `<p class="empty-note">Nothing logged yet. Play a hole and mark where your ball ends up, and the numbers start landing here.</p>`;
    return;
  }
  const rows = taught.map((c) => {
    const est = playingDistance({ ...c, carryOverride: null, measured: { count: 0, sum: 0, recent: [] } }, handicap());
    return `<tr>
      <td>${c.label}</td>
      <td class="num">${c.measured.count}</td>
      <td class="num">${est?.yards ?? "—"}</td>
      <td class="num measured">${lifetimeAverage(c)}</td>
      <td class="num">${rollingAverage(c) ?? "—"}</td>
    </tr>`;
  }).join("");
  el.innerHTML = `<table>
    <thead><tr><th>Club</th><th class="num">Shots</th><th class="num">Estimate</th><th class="num">Lifetime</th><th class="num">Last 5</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="hint" style="margin-top:10px">Estimate is what the chart predicted for your skill level. Lifetime and last five are yours, measured ground to ground, so they include roll.</p>`;
}

async function renderRounds() {
  const el = $("rounds");
  const rounds = await store.listRounds();
  if (!rounds.length) { el.innerHTML = `<p class="empty-note">No rounds yet.</p>`; return; }
  const all = await store.listShots();
  el.innerHTML = rounds.map((r) => {
    const n = all.filter((s) => s.roundId === r.id).length;
    const when = new Date(r.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `<div class="roundrow"><div>${r.course}<br><span>${when} · ${r.teeColor} tees</span></div><div>${n} shot${n === 1 ? "" : "s"}</div></div>`;
  }).join("");
}

/* ---------------- boot ---------------- */

async function load() {
  const [profile, bag] = await Promise.all([store.getProfile(), store.getBag()]);
  if (profile) state.profile = { ...state.profile, ...profile };
  state.bag = bag?.length
    ? CLUB_CATALOG.map((c) => ({ ...c, ...(bag.find((b) => b.id === c.id) || { inBag: STARTER_BAG.includes(c.id) }) }))
    : defaultBag();
  if (!bag?.length) await store.saveBag(state.bag);
  $("voiceBtn").setAttribute("aria-pressed", String(state.profile.voice !== false));
  if (Number.isFinite(state.profile.avgScore)) $("avgScore").value = state.profile.avgScore;
  if (Number.isFinite(state.profile.bestScore)) $("bestScore").value = state.profile.bestScore;
  if (Number.isFinite(state.profile.handicap)) $("handicap").value = state.profile.handicap;
  renderSkill();
  renderBag();
  renderLearned();
  await renderRounds();
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
  // Leaflet comes off a CDN as a plain script. If that is blocked or the
  // network died mid-load, say so rather than throwing a bare ReferenceError
  // from inside the map and taking the whole caddy down with it.
  if (typeof L === "undefined") {
    $("map").innerHTML =
      `<div class="maploadfail"><strong>The map could not load.</strong>` +
      `<span>Leaflet is served from a CDN and this network did not hand it over. ` +
      `The bag and your history still work; the course map needs a connection.</span></div>`;
    store = await createStore();
    setSync();
    await load();
    wireTabs();
    return;
  }

  store = await createStore();
  gmap = createMap($("map"), {
    onMapTap(point) {
      if (state.dogleg) {
        state.waypoints.push(point);
        gmap.setWaypoints([state.ball, ...state.waypoints, ...(state.pin ? [state.pin] : [])].filter(Boolean));
      } else if (!state.ball) {
        state.ball = point;
        gmap.setBall(point);
      } else {
        state.pin = point;
        gmap.setPin(point);
        state.rise = null;
      }
      $("mapHint").hidden = !!(state.ball && state.pin);
      updateReadout();
    },
  });
  gmap.invalidate();

  store.onAuth?.(async (user) => {
    setSync();
    if (user) {
      try { await store.adoptLocal(); } catch (e) { console.warn("[Caddy] adopt failed:", e.message); }
    }
    await load();
  });
  setSync();
  await load();

  // Drop the map on the player's rough position so the first tap is near home.
  here({ timeout: 8000 })
    .then((p) => { gmap.showMe(p, p.accuracy); gmap.centerOn(p, 16); })
    .catch(() => { /* they can search by hand; no need to shout about it */ });

  wireTabs();

  /* play */
  on($("hereBtn"), "click", () => markHere("ball"));
  on($("pinHereBtn"), "click", () => markHere("pin"));
  on($("elevBtn"), "click", checkElevation);
  on($("hitBtn"), "click", hitIt);
  on($("speakBtn"), "click", () => state.last?.ok && say(state.last.spoken));
  on($("doglegBtn"), "click", () => {
    state.dogleg = !state.dogleg;
    $("doglegBtn").setAttribute("aria-pressed", String(state.dogleg));
    $("mapHint").hidden = false;
    $("mapHint").innerHTML = state.dogleg
      ? "Tap each corner the ball has to go round, in order. Tap <b>Trace a dogleg</b> again when you're done."
      : "Tap <b>I'm at my ball</b> to drop your position, then tap the map where the flag is.";
  });
  on($("clearLineBtn"), "click", () => {
    state.waypoints = [];
    gmap.setWaypoints([]);
    updateReadout();
  });
  on($("layerBtn"), "click", () => {
    const now = gmap.setLayer(gmap.layer === "satellite" ? "street" : "satellite");
    $("layerBtn").textContent = now === "satellite" ? "🛰️" : "🗺️";
  });
  on($("locateBtn"), "click", async () => {
    try { const p = await here(); gmap.showMe(p, p.accuracy); gmap.centerOn(p, 18); }
    catch (e) { toast(e.message); }
  });
  for (const id of ["holePar", "shotNo"]) on($(id), "change", updateReadout);
  on($("holeNo"), "change", renderShots);

  /* bag */
  on($("skillSeg"), "click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.profile.skill = btn.dataset.skill;
    await saveProfile();
    renderSkill(); renderBag(); renderLearned(); updateReadout();
  });
  on($("preferSeg"), "click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.profile.prefer = btn.dataset.prefer;
    await saveProfile();
    renderSkill(); renderBag(); renderLearned(); updateReadout();
  });
  for (const [id, key] of [["avgScore", "avgScore"], ["bestScore", "bestScore"], ["handicap", "handicap"]]) {
    on($(id), "change", async () => {
      const v = Number($(id).value);
      state.profile[key] = Number.isFinite(v) && $(id).value !== "" ? v : null;
      await saveProfile();
      renderSkill(); renderBag(); renderLearned(); updateReadout();
    });
  }

  /* chrome */
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

main().catch((e) => {
  console.error(e);
  document.getElementById("toast").textContent = `The caddy failed to start: ${e.message}`;
  document.getElementById("toast").classList.add("show");
});
