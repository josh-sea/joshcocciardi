/* Crowd Cannon: screens, saved progress and the HUD. */
import * as L from './logic.js';
import { Game, webglOk } from './game.js';
import { sfx, unlock, setSound } from './audio.js';

const KEY = 'crowd-cannon-v1';
const $ = (id) => document.getElementById(id);

function loadSave() {
  try { return L.cleanSave(JSON.parse(localStorage.getItem(KEY))); } catch { return L.newSave(); }
}
function store() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

let save = loadSave();
setSound(save.sound);

if (!webglOk()) {
  $('nogl').hidden = false;
  $('menu').hidden = true;
  throw new Error('WebGL unavailable');
}

const hud = {
  fortBar: $('fortBar'), fortFill: $('fortFill'), fortNum: $('fortNum'),
  homeFill: $('homeFill'), homeNum: $('homeNum'),
  charge: $('chargeFill'), chargeWrap: $('charge'), chargeLabel: $('chargeLabel'),
  units: $('units'),
};

let hintShown = false;
const game = new Game($('view'), {
  onHud(h) {
    hud.fortBar.style.transform = `translate(${h.barX}px, ${Math.max(96, h.barY)}px) translate(-50%, -100%)`;
    hud.fortFill.style.width = `${(h.fortHp / h.fortMax) * 100}%`;
    hud.fortNum.textContent = h.fortHp;
    hud.homeFill.style.width = `${(h.homeHp / h.homeMax) * 100}%`;
    hud.homeNum.textContent = h.homeHp;
    hud.charge.style.width = `${Math.min(1, h.charge) * 100}%`;
    hud.chargeWrap.classList.toggle('ready', h.ready);
    hud.chargeLabel.textContent = h.ready ? 'Champion ready' : 'Champion';
    hud.units.textContent = h.units;
  },
  onFirstInput() {
    unlock();
    if (!hintShown) { hintShown = true; $('hint').classList.add('gone'); }
  },
  onEnd(won, info) {
    $('hud').classList.remove('on');
    const lv = current;
    if (won) {
      const coins = L.winCoins(lv, info.homeHp);
      save = { ...save, coins: save.coins + coins, level: lv.n + 1, best: Math.max(save.best, lv.n + 1) };
      store();
      $('endTitle').textContent = 'Fort taken!';
      $('endSub').textContent = `Level ${lv.n} cleared with ${info.homeHp} of ${lv.homeHp} wall left.`;
      $('endCoins').textContent = `+${coins}`;
      $('endCoins').hidden = false;
      $('endGo').textContent = `Level ${lv.n + 1}`;
      $('end').dataset.result = 'won';
    } else {
      const coins = L.loseCoins(lv, info.fortHp);
      save = { ...save, coins: save.coins + coins };
      store();
      const pct = Math.round((1 - info.fortHp / lv.fortHp) * 100);
      $('endTitle').textContent = 'Wall broken';
      $('endSub').textContent = `You knocked ${pct}% off the fort. Aim for the purple multipliers, and spend coins on upgrades.`;
      $('endCoins').textContent = `+${coins}`;
      $('endCoins').hidden = coins === 0;
      $('endGo').textContent = 'Try again';
      $('end').dataset.result = 'lost';
    }
    renderShop($('endShop'));
    $('coins').textContent = save.coins;
    show('end');
  },
});

let current = null;

function prepare(n) {
  current = L.makeLevel(n);
  game.load(current, L.stats(save.up));
  $('lvl').textContent = `Level ${n}`;
  $('menuLevel').textContent = `Level ${n}`;
  $('coins').textContent = save.coins;
}

function show(id) {
  for (const s of ['menu', 'end', 'pause']) $(s).hidden = s !== id;
}

function play() {
  unlock();
  sfx.click();
  if (!current || current.n !== save.level) prepare(save.level);
  else game.load(current, L.stats(save.up));
  show(null);
  $('hud').classList.add('on');
  game.start();
}

function renderShop(el) {
  el.innerHTML = '';
  for (const [key, u] of Object.entries(L.UPGRADES)) {
    const lvl = save.up[key];
    const maxed = lvl >= u.max;
    const cost = L.upgradeCost(key, lvl);
    const b = document.createElement('button');
    b.className = 'up';
    b.disabled = maxed || save.coins < cost;
    b.innerHTML = `
      <span class="up-name">${u.name}</span>
      <span class="up-blurb">${u.blurb}</span>
      <span class="up-pips">${'<i class="on"></i>'.repeat(Math.min(lvl, 12))}${'<i></i>'.repeat(Math.max(0, Math.min(u.max, 12) - lvl))}</span>
      <span class="up-cost">${maxed ? 'Max' : `<b class="coin"></b>${cost}`}</span>`;
    b.addEventListener('click', () => {
      const r = L.buy(save, key);
      if (!r.ok) return;
      save = r.save;
      store();
      sfx.ready();
      $('coins').textContent = save.coins;
      renderShop(el);
    });
    el.appendChild(b);
  }
}

$('play').addEventListener('click', play);
$('endGo').addEventListener('click', play);
$('endMenu').addEventListener('click', () => { sfx.click(); prepare(save.level); game.toMenu(); renderShop($('shop')); show('menu'); });
$('pauseBtn').addEventListener('click', () => { game.pause(true); show('pause'); });
$('resume').addEventListener('click', () => { show(null); game.pause(false); });
$('quit').addEventListener('click', () => { $('hud').classList.remove('on'); prepare(save.level); game.toMenu(); renderShop($('shop')); show('menu'); });
$('restart').addEventListener('click', () => { show(null); game.start(); });

const soundBtn = $('sound');
const paintSound = () => { soundBtn.textContent = save.sound ? 'Sound on' : 'Sound off'; soundBtn.setAttribute('aria-pressed', String(save.sound)); };
soundBtn.addEventListener('click', () => { save = { ...save, sound: !save.sound }; store(); setSound(save.sound); paintSound(); unlock(); sfx.click(); });
paintSound();

$('reset').addEventListener('click', () => {
  if (!confirm('Start over from level 1 and clear coins and upgrades?')) return;
  save = { ...L.newSave(), sound: save.sound };
  store();
  prepare(1);
  renderShop($('shop'));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'play') { game.pause(true); show('pause'); }
});

// A level from the address bar, for testing: #level=7
const m = location.hash.match(/level=(\d+)/);
if (m) save = { ...save, level: Math.max(1, +m[1]) };

prepare(save.level);
renderShop($('shop'));
show('menu');
window.__crowd = { game, L };
