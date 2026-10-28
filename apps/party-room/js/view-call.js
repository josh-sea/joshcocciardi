/* The video strip across the top of the lobby and every game.
 *
 * Each person's <video> element is made once and kept, keyed by who it
 * is: re-creating it on every update would make the picture blink each
 * time a score changed.
 */
import { esc } from './ui.js';
import { CAP } from './callplan.js';

export function mountCallBar(el, call, { names, onToggle }) {
  const videos = new Map(); // uid -> { tile, video }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-v]');
    if (b) {
      const v = b.dataset.v;
      if (v === 'join') { b.disabled = true; await call.start(); }
      else if (v === 'leave') await call.stop();
      else if (v === 'cam') call.setCam(!call.cam);
      else if (v === 'mic') call.setMic(!call.mic);
      onToggle && onToggle();
      return;
    }
    // Sound can be blocked until a tap; any tap on the strip retries it.
    const tile = e.target.closest('.vt');
    if (tile) { const vid = tile.querySelector('video'); if (vid) vid.play().catch(() => {}); }
  });

  function tileFor(uid, me) {
    let t = videos.get(uid);
    if (!t) {
      const tile = document.createElement('div');
      tile.className = 'vt';
      tile.innerHTML = '<video autoplay playsinline></video><span class="vt-face"></span><span class="vt-name"></span><span class="vt-state"></span>';
      const video = tile.querySelector('video');
      if (me) { video.muted = true; tile.classList.add('self'); }
      t = { tile, video, stream: null };
      videos.set(uid, t);
    }
    return t;
  }

  function render() {
    if (!call.on) {
      for (const t of videos.values()) t.video.srcObject = null;
      videos.clear();
      el.innerHTML = `<div class="vbar-off">
        <button class="btn small teal" data-v="join">📹 Turn on video</button>
        <span>${esc(call.error || 'See and hear everyone while you play. Up to ' + CAP + ' people.')}</span></div>`;
      return;
    }
    const tiles = call.tiles();
    let strip = el.querySelector('.vstrip');
    if (!strip) {
      el.innerHTML = `<div class="vstrip"></div><div class="vctl">
        <button class="vbtn" data-v="mic"></button><button class="vbtn" data-v="cam"></button>
        <button class="vbtn off" data-v="leave" aria-label="Leave video">✕</button></div>`;
      strip = el.querySelector('.vstrip');
    }
    const keep = new Set(tiles.map((x) => x.uid));
    for (const [uid, t] of videos) {
      if (!keep.has(uid)) { t.video.srcObject = null; t.tile.remove(); videos.delete(uid); }
    }
    tiles.forEach((x, i) => {
      const t = tileFor(x.uid, x.me);
      if (t.stream !== x.stream) {
        t.stream = x.stream || null;
        t.video.srcObject = t.stream;
        if (t.stream) t.video.play().catch(() => t.tile.classList.add('tap'));
      }
      const name = names()[x.uid] || '?';
      t.tile.querySelector('.vt-name').textContent = `${x.me ? 'You' : name}${x.mic ? '' : ' 🔇'}`;
      t.tile.querySelector('.vt-face').textContent = name.slice(0, 1).toUpperCase();
      t.tile.querySelector('.vt-state').textContent = x.state === 'failed' ? 'Video unavailable' : x.state === 'connecting' ? 'Connecting…' : '';
      t.tile.classList.toggle('nocam', !x.cam || !x.stream || x.state === 'failed');
      if (strip.children[i] !== t.tile) strip.insertBefore(t.tile, strip.children[i] || null);
    });
    const mic = el.querySelector('[data-v="mic"]'), cam = el.querySelector('[data-v="cam"]');
    mic.textContent = call.mic ? '🎤' : '🔇';
    mic.classList.toggle('off', !call.mic);
    mic.setAttribute('aria-label', call.mic ? 'Mute' : 'Unmute');
    cam.textContent = call.cam ? '📷' : '🚫';
    cam.classList.toggle('off', !call.cam);
    cam.setAttribute('aria-label', call.cam ? 'Turn camera off' : 'Turn camera on');
  }

  return { render };
}
