// Gatekeeper parent console — UI logic. Classic script; waits for GKStoreReady.
(function () {
  'use strict';

  let Store, hid = null;
  let unsub = [];               // active Firestore listeners, torn down on sign-out
  let allActivity = [];
  const $ = (id) => document.getElementById(id);

  // ── small helpers ──────────────────────────────────────────────────────
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (ts.toMillis) return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return 0;
  }

  function timeAgo(ts) {
    const ms = toMillis(ts);
    if (!ms) return '';
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  const OUTCOME = {
    allow:         { label: 'Allowed',     cls: 'ok' },
    ask:           { label: 'Asked',       cls: 'warn' },
    appeal:        { label: 'Appealed',    cls: 'warn' },
    escalate:      { label: 'Sent to you', cls: 'esc' },
    block:         { label: 'Blocked',     cls: 'bad' },
    'off-session': { label: 'Off session', cls: 'off' },
    nosession:     { label: 'No session',  cls: 'off' },
    deny:          { label: 'Denied',      cls: 'bad' },
  };

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function show(el, on) { el.classList.toggle('hidden', !on); }

  // ── auth flow ──────────────────────────────────────────────────────────
  async function onSignedIn(user) {
    $('who').textContent = user.email || '';
    show($('signout-btn'), true);
    show($('signin'), false);
    show($('app'), true);

    const h = await Store.ensureHousehold();
    hid = h.hid;
    fillConfig(h.data);
    $('api-url').textContent = (window.GK_CONFIG || {}).apiBase || '';
    updatePushNudge();

    // Live listeners.
    unsub.push(Store.watchHousehold(hid, (d) => d && fillConfig(d)));
    unsub.push(Store.watchRequests(hid, renderRequests));
    unsub.push(Store.watchActivity(hid, (rows) => { allActivity = rows; renderActivity(); }));
    unsub.push(Store.watchSessions(hid, renderSessions));
    unsub.push(Store.watchDevices(hid, renderDevices));

    // Deep link from a push notification: ?request=<id> jumps to Requests.
    const p = new URLSearchParams(location.search);
    if (p.get('request')) switchTab('requests');
  }

  function onSignedOut() {
    unsub.forEach((u) => { try { u(); } catch (e) {} });
    unsub = [];
    hid = null;
    $('who').textContent = '';
    show($('signout-btn'), false);
    show($('app'), false);
    show($('signin'), true);
  }

  // ── tabs ───────────────────────────────────────────────────────────────
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tabpanel').forEach((p) => show(p, p.id === 'tab-' + name));
  }

  // ── requests ───────────────────────────────────────────────────────────
  function renderRequests(rows) {
    const pending = rows.filter((r) => r.status === 'pending');
    const decided = rows.filter((r) => r.status !== 'pending').slice(0, 40);
    const badge = $('req-badge');
    badge.textContent = pending.length;
    show(badge, pending.length > 0);

    const list = $('requests-list');
    show($('requests-empty'), rows.length === 0);
    list.innerHTML = '';

    const section = (title, items) => {
      if (!items.length) return;
      const h = document.createElement('div');
      h.className = 'list-head';
      h.textContent = title;
      list.appendChild(h);
      items.forEach((r) => list.appendChild(requestCard(r)));
    };
    section('Waiting on you', pending);
    section('Recently decided', decided);
  }

  function requestCard(r) {
    const el = document.createElement('div');
    el.className = 'card request ' + (r.status === 'pending' ? 'pending' : 'done');
    const target = r.target || '';
    const link = /^https?:\/\//.test(target)
      ? `<a href="${esc(target)}" target="_blank" rel="noopener">${esc(target)}</a>`
      : esc(target);
    const statusPill = r.status !== 'pending'
      ? `<span class="pill ${r.status === 'approved' ? 'ok' : 'bad'}">${r.status === 'approved' ? 'Approved' : 'Denied'}</span>`
      : '';

    el.innerHTML = `
      <div class="request-top">
        <span class="kind">${esc(r.kind || 'page')}</span>
        <span class="when">${esc(timeAgo(r.createdAt))}</span>
        ${statusPill}
      </div>
      ${r.topic ? `<div class="topic">${esc(r.topic)}</div>` : ''}
      <div class="target">${link}</div>
      ${r.title ? `<div class="ptitle">${esc(r.title)}</div>` : ''}
      ${r.reason ? `<blockquote class="reason">${esc(r.reason)}</blockquote>` : ''}
      ${r.sessionGoal ? `<div class="ctx">Session goal: ${esc(r.sessionGoal)}</div>` : ''}
      ${r.context ? `<div class="ctx">Came from: ${esc(r.context)}</div>` : ''}
    `;

    if (r.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const approve = document.createElement('button');
      approve.className = 'primary sm'; approve.textContent = 'Approve';
      approve.onclick = () => decide(r.id, 'approved', approve);
      const deny = document.createElement('button');
      deny.className = 'danger sm'; deny.textContent = 'Deny';
      deny.onclick = () => decide(r.id, 'denied', deny);
      actions.append(approve, deny);
      el.appendChild(actions);
    } else if (r.note) {
      const note = document.createElement('div');
      note.className = 'ctx';
      note.textContent = 'Your note: ' + r.note;
      el.appendChild(note);
    }
    return el;
  }

  async function decide(id, status, btn) {
    btn.disabled = true;
    let note = '';
    if (status === 'denied') note = prompt('Optional note to send back (why not):', '') || '';
    try {
      await Store.decide(hid, id, status, note);
      toast(status === 'approved' ? 'Approved' : 'Denied');
    } catch (e) {
      btn.disabled = false;
      toast('Could not save — ' + (e.message || e));
    }
  }

  // ── activity ───────────────────────────────────────────────────────────
  function renderActivity() {
    const term = $('activity-search').value.trim().toLowerCase();
    const outcome = $('activity-outcome').value;
    const rows = allActivity.filter((e) => {
      if (outcome && e.decision !== outcome) return false;
      if (!term) return true;
      return [e.target, e.title, e.reason, e.appeal, e.topic, e.host]
        .some((f) => String(f || '').toLowerCase().includes(term));
    });

    const sites = new Set(rows.map((e) => e.host).filter(Boolean));
    const mins = Math.round(rows.reduce((a, e) => a + (e.seconds || 0), 0) / 60);
    const by = (d) => rows.filter((e) => e.decision === d).length;
    $('activity-summary').innerHTML =
      `<b>${rows.length}</b> events · <b>${sites.size}</b> sites · <b>${mins}</b> min · ` +
      `<span class="ok">${by('allow')} allowed</span> · ` +
      `<span class="warn">${by('ask') + by('appeal')} asked</span> · ` +
      `<span class="bad">${by('block') + by('deny')} blocked</span>`;

    show($('activity-empty'), rows.length === 0);
    const list = $('activity-list');
    list.innerHTML = '';
    rows.slice(0, 300).forEach((e) => list.appendChild(activityRow(e)));
  }

  function activityRow(e) {
    const o = OUTCOME[e.decision] || { label: e.decision || '?', cls: 'off' };
    const el = document.createElement('div');
    el.className = 'row';
    const target = e.target || '';
    const main = /^https?:\/\//.test(target)
      ? `<a href="${esc(target)}" target="_blank" rel="noopener">${esc(e.title || target)}</a>`
      : esc(e.title || target);
    el.innerHTML = `
      <span class="pill ${o.cls}">${esc(o.label)}</span>
      <div class="row-main">
        <div class="row-title">${main}</div>
        <div class="row-sub">${esc(e.host || e.kind || '')}${e.seconds ? ' · ' + Math.round(e.seconds / 60) + 'm' : ''} · ${esc(timeAgo(e.createdAt || e.ts))}</div>
        ${e.appeal ? `<div class="row-reason">“${esc(e.appeal)}”</div>` : ''}
      </div>`;
    return el;
  }

  // ── sessions ───────────────────────────────────────────────────────────
  function renderSessions(rows) {
    show($('sessions-empty'), rows.length === 0);
    const list = $('sessions-list');
    list.innerHTML = '';
    rows.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'card session';
      el.innerHTML = `
        <div class="request-top">
          <span class="pill ${s.active ? 'ok' : 'off'}">${s.active ? 'Active' : 'Ended'}</span>
          <span class="when">${esc(timeAgo(s.startedAt))}</span>
        </div>
        <div class="target">${esc(s.goal || '(no goal set)')}</div>`;
      list.appendChild(el);
    });
  }

  // ── setup ──────────────────────────────────────────────────────────────
  function fillConfig(d) {
    if (!d) return;
    $('cfg-name').value = d.kidName || '';
    $('cfg-age').value = d.kidAge || '';
    $('cfg-context').value = d.projectContext || '';
    document.querySelectorAll('.kid-name').forEach((n) => { n.textContent = d.kidName || 'your kid'; });
    $('key-status').textContent = d.hasKey ? '✅ A key is set.' : 'No key set yet — screening will fail until you add one.';
    if (d.usage) {
      $('key-status').textContent += ` (${d.usage.calls || 0} screening calls so far)`;
    }
  }

  function renderDevices(rows) {
    const box = $('devices');
    const ext = rows.filter((d) => d.type === 'extension');
    if (!ext.length) { box.innerHTML = '<p class="muted small">No browsers paired yet.</p>'; return; }
    box.innerHTML = '<div class="list-head">Paired browsers</div>';
    ext.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'device';
      el.innerHTML = `<span>💻 ${esc(d.label || 'Browser')} <span class="muted small">· seen ${esc(timeAgo(d.lastSeenAt))}</span></span>`;
      const rm = document.createElement('button');
      rm.className = 'ghost sm'; rm.textContent = 'Unpair';
      rm.onclick = async () => { await Store.removeDevice(hid, d.id); toast('Unpaired'); };
      el.appendChild(rm);
      box.appendChild(el);
    });
  }

  async function updatePushNudge() {
    const supported = 'Notification' in window && (window.GK_CONFIG || {}).vapidKey;
    show($('push-nudge'), supported && Notification.permission !== 'granted');
  }

  // ── wire up ────────────────────────────────────────────────────────────
  function bind() {
    $('signin-btn').onclick = () => Store.signIn().catch((e) => toast(e.message || String(e)));
    $('signout-btn').onclick = () => Store.signOut();
    document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => switchTab(t.dataset.tab); });
    $('activity-search').oninput = renderActivity;
    $('activity-outcome').onchange = renderActivity;

    $('gen-code').onclick = async () => {
      try {
        const code = await Store.createPairingCode(hid);
        $('pair-code').textContent = code.split('').join(' ');
        toast('Code generated — good for 15 minutes');
      } catch (e) { toast('Could not create code — ' + (e.message || e)); }
    };

    $('save-key').onclick = async () => {
      const v = $('key-input').value.trim();
      if (!v) return toast('Paste a key first');
      try { await Store.setKey(hid, v); $('key-input').value = ''; toast('Key saved'); }
      catch (e) { toast('Could not save key — ' + (e.message || e)); }
    };

    $('save-cfg').onclick = async () => {
      try {
        await Store.saveConfig(hid, {
          kidName: $('cfg-name').value.trim(),
          kidAge: Number($('cfg-age').value) || null,
          projectContext: $('cfg-context').value.trim(),
        });
        $('cfg-status').textContent = 'Saved ✓';
        setTimeout(() => { $('cfg-status').textContent = ''; }, 2000);
      } catch (e) { toast('Could not save — ' + (e.message || e)); }
    };

    $('enable-push').onclick = async () => {
      const r = await Store.enablePush(hid).catch((e) => 'error:' + e.message);
      const msg = {
        enabled: 'Notifications on', denied: 'Notifications blocked in your browser',
        unsupported: 'This browser can’t do web push', unconfigured: 'Push key not configured yet',
      }[r] || ('Could not enable — ' + r);
      toast(msg);
      updatePushNudge();
    };

    window.addEventListener('gk-push', () => { switchTab('requests'); toast('New request'); });
  }

  // ── boot ───────────────────────────────────────────────────────────────
  window.GKStoreReady.then((s) => {
    Store = s;
    bind();
    Store.onAuth((user) => { if (user) onSignedIn(user); else onSignedOut(); });
  });
})();
