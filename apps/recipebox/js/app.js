// Recipe Box UI. All rendering happens here; persistence lives in js/store.js.
'use strict';

let Store = null;

const $  = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  user: null,
  profile: null,
  myRecipes: null,     // null = not loaded yet
  shared: null,
  connections: null,
  groups: null,        // group boxes I'm a member of
  groupInvites: null,  // invites waiting on me
  filterCat: '',
  editDraft: null,     // pending uploads while editing
  importDraft: null,   // AI-read card waiting for review on #/new
};

// Words of wisdom on a card — with the old freeform `notes` field folded in
// as a single tip so pre-wisdom cards keep saying what they said.
const tipsOf = r => (r?.tips?.length ? r.tips : (r?.notes ? [r.notes] : []));

// The sample card offered when a box is empty — a real family recipe to show
// what a filled-out card looks like. One tap copies it into your own box.
const STARTER_RECIPE = {
  title: 'Coconut Curry Shrimp',
  category: 'Dinner',
  description: 'A quick, mild coconut curry with shrimp, bell pepper, and red onion, brightened with lime.',
  ingredients: [
    '1 lb large shrimp, peeled and deveined (frozen is fine, see notes)',
    '1/2 red onion, sliced',
    '1 bell pepper, sliced',
    '3 garlic cloves, minced',
    '1/2 tsp garlic powder',
    '1/2 tsp onion powder',
    '1/2 tsp ground ginger',
    '1/2 tsp turmeric',
    '1 1/2 tsp mild curry powder',
    '1/2 tsp salt',
    '1/4 tsp black pepper',
    '1 cup coconut milk (full-fat)',
    '1 lime, juiced',
    '1 tbsp cooking oil',
  ],
  steps: [
    'If using frozen shrimp, thaw them first by running under cold water for 5 to 10 minutes or leaving in the fridge overnight. Pat the shrimp very dry with paper towels. This matters more than usual here since extra water will thin out the sauce and stop the shrimp from browning.',
    'Heat 1 tbsp cooking oil in a large skillet over medium heat. Add the sliced red onion and bell pepper, and cook until softened, about 4 to 5 minutes.',
    'Stir in the minced garlic, 1/2 tsp garlic powder, 1/2 tsp onion powder, 1/2 tsp ground ginger, 1/2 tsp turmeric, and 1 1/2 tsp mild curry powder. Cook for about 30 seconds, just until fragrant.',
    'Pour in 1 cup coconut milk, add 1/2 tsp salt and 1/4 tsp black pepper, and stir well. Simmer for 2 to 3 minutes to let it thicken slightly.',
    'Add the shrimp to the skillet in a single layer. Cook until just opaque and pink, about 2 to 3 minutes per side. Frozen-then-thawed shrimp cook fast, so watch closely to avoid rubbery texture.',
    'Remove from heat, stir in the lime juice, and taste for salt. Serve over rice.',
  ],
  tips: [
    'If shrimp are frozen, thaw and pat very dry before cooking; excess water dilutes the sauce and prevents browning.',
    'Small or medium shrimp cook a bit faster than large — watch for opaque, pink color rather than going by time alone.',
  ],
};

// ── Small utilities ────────────────────────────────────────────────────────

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('toast-error', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function openModal(id)  { $('#' + id).classList.remove('hidden'); }
function closeModal(id) { $('#' + id).classList.add('hidden'); }

function busy(btn, on, label) {
  if (!btn) return;
  btn.disabled = on;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Working…'; }
  else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
}

const otherUid = conn => (conn.users || []).find(u => u !== state.user?.uid);
const otherName = conn => (conn.usernames || {})[otherUid(conn)] || 'someone';
const acceptedConnections = () => (state.connections || []).filter(c => c.status === 'accepted');

// ── Router ─────────────────────────────────────────────────────────────────

function route() {
  const hash = location.hash || '#/box';
  const view = $('#view');
  window.scrollTo(0, 0);
  closeMenu();
  stopRecording(true); // never leave the mic running across a navigation

  if (!state.user) { renderLanding(view); setActiveTab(null); return; }

  const m = hash.match(/^#\/(box|shared|people|new|recipe|edit|import|groups|group|u)(?:\/(.+))?$/);
  const page = m ? m[1] : 'box';
  const arg = m ? m[2] : null;

  setActiveTab(page === 'box' || page === 'new' || page === 'import' ? 'box'
             : page === 'shared' ? 'shared'
             : page === 'groups' || page === 'group' ? 'groups'
             : page === 'people' ? 'people' : null);

  if (page === 'box')    return renderBox(view);
  if (page === 'shared') return renderShared(view);
  if (page === 'people') return renderPeople(view);
  if (page === 'new')    return renderEdit(view, null);
  if (page === 'edit')   return renderEdit(view, arg);
  if (page === 'import') return renderImport(view);
  if (page === 'recipe') return renderRecipe(view, arg);
  if (page === 'groups') return renderGroups(view);
  if (page === 'group')  return renderGroup(view, arg);
  if (page === 'u')      return renderBio(view, arg);
  renderBox(view);
}

function setActiveTab(tab) {
  $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}

// ── Landing (signed out) ───────────────────────────────────────────────────

function renderLanding(view) {
  view.innerHTML = `
    <section class="landing">
      <div class="landing-card card-paper">
        <div class="card-topline"></div>
        <h1 class="hand">The family recipe box,<br/>without the flour on it.</h1>
        <p>Write your recipes onto cards and keep them in your own box. Connect with
        family and friends, and hand them a card — or your whole box — just like in
        real life. Their boxes stay theirs, yours stays yours.</p>
        <ul class="landing-points">
          <li>🖊️ Simple cards: ingredients, steps, and the little notes that matter</li>
          <li>📷 Photos and videos — grandma rolling out the dough belongs on the card</li>
          <li>🤝 Sharing is gated by real connections, not links or feeds</li>
          <li>🚫 No blogs, no ads, no life story before the ingredients</li>
        </ul>
        <button id="landing-signin" class="btn btn-primary btn-big">Open your box</button>
      </div>
    </section>`;
  $('#landing-signin').addEventListener('click', () => openModal('auth-modal'));
}

// ── My Box ─────────────────────────────────────────────────────────────────

async function renderBox(view) {
  if (state.myRecipes === null) {
    view.innerHTML = spinner('Opening your box…');
    try { state.myRecipes = await Store.myRecipes(); }
    catch (e) { view.innerHTML = errorBlock(e); return; }
  }
  const recipes = state.myRecipes;

  if (!recipes.length) {
    view.innerHTML = `
      <section class="page">
        <div class="empty-state">
          <div class="empty-art">🗃️</div>
          <h2 class="hand">Your box is empty</h2>
          <p>Write your first card, or start with the house sample.</p>
          <div class="empty-actions">
            <a class="btn btn-primary" href="#/new">✚ Write a card</a>
            <a class="btn btn-ghost" href="#/import">✨ Import from photo or voice</a>
            <button id="add-starter" class="btn btn-ghost">Add “${esc(STARTER_RECIPE.title)}”</button>
          </div>
        </div>
      </section>`;
    $('#add-starter').addEventListener('click', async e => {
      busy(e.target, true, 'Adding…');
      try {
        await Store.saveRecipe(null, STARTER_RECIPE);
        state.myRecipes = null;
        toast(`“${STARTER_RECIPE.title}” is in your box.`);
        route();
      } catch (err) { toast(err.message, true); busy(e.target, false); }
    });
    return;
  }

  const cats = [...new Set(recipes.map(r => r.category).filter(Boolean))].sort();
  if (state.filterCat && !cats.includes(state.filterCat)) state.filterCat = '';
  const shown = state.filterCat ? recipes.filter(r => r.category === state.filterCat) : recipes;

  const wisdom = (state.profile?.wisdom || []).length
    ? state.profile.wisdom
    : recipes.flatMap(tipsOf).slice(0, 3); // until you curate, your cards speak

  view.innerHTML = `
    <section class="page">
      <div class="page-head">
        <h1 class="hand">My Box <span class="count">(${recipes.length} card${recipes.length === 1 ? '' : 's'})</span></h1>
        <div class="page-head-actions">
          <a class="btn btn-ghost" href="#/import">✨ Import</a>
          <a class="btn btn-primary" href="#/new">✚ Write a card</a>
        </div>
      </div>
      <p class="page-sub">This is your page, too — people who look you up see only the cards
      you've shared with them, topped by your words of wisdom.</p>
      ${wisdomCardHtml(wisdom, true)}
      ${cats.length ? `<div class="chip-row">
        <button class="chip ${!state.filterCat ? 'active' : ''}" data-cat="">All</button>
        ${cats.map(c => `<button class="chip ${state.filterCat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>` : ''}
      <div class="card-grid">${shown.map(r => recipeCardHtml(r, true)).join('')}</div>
    </section>`;

  wireWisdomCard(wisdom, true);

  $$('.chip[data-cat]').forEach(ch => ch.addEventListener('click', () => {
    state.filterCat = ch.dataset.cat;
    route();
  }));
}

// ── Words of wisdom card (My Box shows yours, editable; bio pages show theirs) ─

function wisdomCardHtml(wisdom, mine) {
  return `
      <div class="wisdom-card card-paper">
        <div class="card-topline"></div>
        <h2 class="hand">Words of wisdom</h2>
        <ul class="wisdom-list" id="bio-wisdom">
          ${wisdom.slice(0, 3).map(t => `<li>${esc(t)}</li>`).join('') || '<li class="muted">Nothing pinned yet.</li>'}
        </ul>
        <div class="form-actions">
          ${wisdom.length > 3 ? `<button id="wisdom-more" class="btn btn-ghost btn-sm">See all ${wisdom.length}</button>` : ''}
          ${mine ? `<button id="wisdom-edit" class="btn btn-ghost btn-sm hidden">✏️ Edit</button>` : ''}
        </div>
        ${mine ? `<form id="wisdom-form" class="hidden">
          <div class="field">
            <label for="wisdom-input">One per line, top one first — your page leads with the first three.</label>
            <textarea id="wisdom-input" rows="6">${esc(wisdom.join('\n'))}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
            <button type="button" id="wisdom-cancel" class="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </form>` : ''}
      </div>`;
}

function wireWisdomCard(wisdom, mine) {
  const expand = () => {
    $('#bio-wisdom').innerHTML = wisdom.map(t => `<li>${esc(t)}</li>`).join('');
    $('#wisdom-more')?.classList.add('hidden');
    $('#wisdom-edit')?.classList.remove('hidden');
  };
  $('#wisdom-more')?.addEventListener('click', expand);
  if (!mine) return;

  if (wisdom.length <= 3) $('#wisdom-edit')?.classList.remove('hidden');
  $('#wisdom-edit')?.addEventListener('click', () => {
    $('#wisdom-form').classList.remove('hidden');
    $('#wisdom-edit').classList.add('hidden');
  });
  $('#wisdom-cancel')?.addEventListener('click', () => {
    $('#wisdom-form').classList.add('hidden');
    $('#wisdom-edit').classList.remove('hidden');
  });
  $('#wisdom-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    busy(btn, true, 'Saving…');
    try {
      const saved = await Store.saveWisdom($('#wisdom-input').value.split('\n'));
      state.profile.wisdom = saved;
      toast('Your wisdom is on the wall.');
      route();
    } catch (err) { toast(err.message, true); busy(btn, false); }
  });
}

function recipeCardHtml(r, mine) {
  const photo = (r.media || []).find(m => m.type === 'image');
  const sharedCount = (r.sharedWith || []).length;
  return `
    <a class="recipe-card card-paper" href="#/recipe/${esc(r.id)}">
      <div class="card-topline"></div>
      ${photo ? `<div class="card-photo" style="background-image:url('${esc(photo.url)}')"></div>` : ''}
      <h3 class="hand">${esc(r.title)}</h3>
      ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ''}
      ${r.description ? `<p class="card-desc">${esc(r.description)}</p>` : ''}
      <div class="card-foot">
        ${mine
          ? (sharedCount ? `<span title="Shared with ${sharedCount}">🤝 ${sharedCount}</span>` : '<span></span>')
          : `<span class="from-tag">from ${esc(r.ownerUsername || 'family')}’s box</span>`}
        <span>${(r.media || []).some(m => m.type === 'video') ? '🎬' : ''}${(r.media || []).some(m => m.type === 'audio') ? '🎙️' : ''}${photo ? '📷' : ''}</span>
      </div>
    </a>`;
}

// ── Shared with me ─────────────────────────────────────────────────────────

async function renderShared(view) {
  if (state.shared === null) {
    view.innerHTML = spinner('Checking the boxes shared with you…');
    try { state.shared = await Store.sharedWithMe(); }
    catch (e) { view.innerHTML = errorBlock(e); return; }
  }
  const recipes = state.shared;

  if (!recipes.length) {
    view.innerHTML = `
      <section class="page">
        <div class="empty-state">
          <div class="empty-art">🤲</div>
          <h2 class="hand">No cards yet</h2>
          <p>When family or friends hand you a card, it shows up here — grouped by whose box it came from.</p>
          <a class="btn btn-ghost" href="#/people">Find your people →</a>
        </div>
      </section>`;
    return;
  }

  const byOwner = new Map();
  for (const r of recipes) {
    const key = r.ownerUsername || r.ownerUid;
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key).push(r);
  }

  view.innerHTML = `
    <section class="page">
      <div class="page-head"><h1 class="hand">Shared with Me</h1></div>
      ${[...byOwner.entries()].map(([owner, rs]) => `
        <h2 class="owner-head hand"><a class="owner-link" href="#/u/${esc(owner)}">📦 ${esc(owner)}’s box</a> <span class="count">(${rs.length})</span></h2>
        <div class="card-grid">${rs.map(r => recipeCardHtml(r, false)).join('')}</div>
      `).join('')}
    </section>`;
}

// ── Family & Friends ───────────────────────────────────────────────────────

async function renderPeople(view) {
  if (state.connections === null) {
    view.innerHTML = spinner('Finding your people…');
    try { state.connections = await Store.myConnections(); }
    catch (e) { view.innerHTML = errorBlock(e); return; }
  }
  updatePeopleBadge();

  const conns = state.connections;
  const incoming = conns.filter(c => c.status === 'pending' && c.requestedBy !== state.user.uid);
  const outgoing = conns.filter(c => c.status === 'pending' && c.requestedBy === state.user.uid);
  const accepted = conns.filter(c => c.status === 'accepted');

  view.innerHTML = `
    <section class="page page-narrow">
      <div class="page-head">
        <h1 class="hand">Family &amp; Friends</h1>
      </div>
      <p class="page-sub">Sharing is gated by connections, like real life: you can only hand a card to
      someone who's agreed to know you. Ask for their username.</p>

      <form id="connect-form" class="connect-form">
        <input id="connect-username" type="text" placeholder="their username…" autocomplete="off" required />
        <button type="submit" class="btn btn-primary">Send request</button>
      </form>

      ${incoming.length ? `<h2 class="section-head">Wants to connect</h2>` +
        incoming.map(c => `
          <div class="person-row" data-id="${esc(c.id)}">
            <span class="person-name">👋 <b>${esc(otherName(c))}</b></span>
            <span class="person-actions">
              <button class="btn btn-primary btn-sm" data-accept="${esc(c.id)}">Accept</button>
              <button class="btn btn-ghost btn-sm" data-remove="${esc(c.id)}" data-other="${esc(otherUid(c))}">Decline</button>
            </span>
          </div>`).join('') : ''}

      <h2 class="section-head">Connected</h2>
      ${accepted.length ? accepted.map(c => `
        <div class="person-row" data-id="${esc(c.id)}">
          <span class="person-name">🤝 <a class="person-link" href="#/u/${esc(otherName(c))}"><b>${esc(otherName(c))}</b></a></span>
          <span class="person-actions">
            <button class="btn btn-ghost btn-sm" data-shareall="${esc(otherUid(c))}" data-name="${esc(otherName(c))}" title="Share every card in your box">Share my whole box</button>
            <button class="btn btn-ghost btn-sm btn-danger" data-remove="${esc(c.id)}" data-other="${esc(otherUid(c))}">Disconnect</button>
          </span>
        </div>`).join('')
      : `<p class="muted">No connections yet. Send a request above, or tell your family to make a box at
         <b>gramandpops.com</b> and ask for your username.</p>`}

      ${outgoing.length ? `<h2 class="section-head">Waiting on them</h2>` +
        outgoing.map(c => `
          <div class="person-row" data-id="${esc(c.id)}">
            <span class="person-name">⏳ <b>${esc(otherName(c))}</b></span>
            <span class="person-actions">
              <button class="btn btn-ghost btn-sm" data-remove="${esc(c.id)}" data-other="${esc(otherUid(c))}">Cancel</button>
            </span>
          </div>`).join('') : ''}
    </section>`;

  $('#connect-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    busy(btn, true, 'Sending…');
    try {
      const name = await Store.requestConnection($('#connect-username').value);
      state.connections = null;
      toast(`Request sent to ${name}.`);
      route();
    } catch (err) { toast(err.message, true); busy(btn, false); }
  });

  $$('[data-accept]').forEach(b => b.addEventListener('click', async () => {
    busy(b, true, '…');
    try {
      await Store.acceptConnection(b.dataset.accept);
      state.connections = null; state.shared = null;
      toast('Connected! You can hand each other cards now.');
      route();
    } catch (err) { toast(err.message, true); busy(b, false); }
  }));

  $$('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    busy(b, true, '…');
    try {
      await Store.removeConnection(b.dataset.remove, b.dataset.other);
      state.connections = null; state.myRecipes = null; state.shared = null;
      route();
    } catch (err) { toast(err.message, true); busy(b, false); }
  }));

  $$('[data-shareall]').forEach(b => b.addEventListener('click', async () => {
    busy(b, true, 'Sharing…');
    try {
      const n = await Store.shareAllWith(b.dataset.shareall);
      state.myRecipes = null;
      toast(n ? `Shared ${n} card${n === 1 ? '' : 's'} with ${b.dataset.name}.`
              : `${b.dataset.name} already has every card in your box.`);
      busy(b, false);
    } catch (err) { toast(err.message, true); busy(b, false); }
  }));
}

function updatePeopleBadge() {
  const n = (state.connections || []).filter(c => c.status === 'pending' && c.requestedBy !== state.user?.uid).length;
  const badge = $('#people-badge');
  badge.textContent = n || '';
  badge.classList.toggle('hidden', !n);
  const g = (state.groupInvites || []).length;
  const gBadge = $('#groups-badge');
  gBadge.textContent = g || '';
  gBadge.classList.toggle('hidden', !g);
  // Mirror onto the hamburger, which is all you see of the menu on phones.
  $('#menu-btn').classList.toggle('menu-btn-alert', n + g > 0);
}

function closeMenu() {
  document.body.classList.remove('menu-open');
  $('#menu-btn').setAttribute('aria-expanded', 'false');
}

// ── Recipe detail ──────────────────────────────────────────────────────────

async function renderRecipe(view, id) {
  view.innerHTML = spinner('Pulling the card…');
  let r = (state.myRecipes || []).find(x => x.id === id) ||
          (state.shared || []).find(x => x.id === id);
  if (!r) {
    try { r = await Store.getRecipe(id); }
    catch (e) { view.innerHTML = errorBlock(e); return; }
  }
  if (!r) {
    view.innerHTML = `<section class="page"><div class="empty-state"><h2 class="hand">Card not found</h2>
      <p>It may have been taken back or thrown out.</p><a class="btn btn-ghost" href="#/box">← My Box</a></div></section>`;
    return;
  }

  const mine = r.ownerUid === state.user.uid;
  const media = r.media || [];

  view.innerHTML = `
    <section class="page page-narrow">
      <div class="detail-nav">
        <a class="linklike" href="${mine ? '#/box' : '#/shared'}">← ${mine ? 'My Box' : 'Shared with Me'}</a>
        ${mine ? `<span class="detail-actions">
          <button id="share-btn" class="btn btn-ghost btn-sm">🤝 Share</button>
          <a class="btn btn-ghost btn-sm" href="#/edit/${esc(r.id)}">✏️ Edit</a>
          <button id="delete-btn" class="btn btn-ghost btn-sm btn-danger">🗑 Throw out</button>
        </span>` : `<span class="detail-actions">
          <button id="copy-btn" class="btn btn-primary btn-sm" title="Make your own copy — it stays in your box even if the original goes away">📥 Copy to my box</button>
        </span>`}
      </div>

      <article class="recipe-detail card-paper">
        <div class="card-topline"></div>
        <header class="detail-head">
          <h1 class="hand">${esc(r.title)}</h1>
          <div class="detail-meta">
            ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ''}
            ${!mine ? `<span class="from-tag">from ${r.ownerUsername
              ? `<a class="person-link" href="#/u/${esc(r.ownerUsername)}">${esc(r.ownerUsername)}</a>` : 'family'}’s box</span>` : ''}
            ${mine && r.copiedFrom ? `<span class="from-tag">copied from ${esc(r.copiedFrom)}</span>` : ''}
            ${mine && (r.sharedWith || []).length ? `<span class="from-tag">shared with ${(r.sharedWith).length}</span>` : ''}
            ${mine && (r.sharedGroups || []).length ? `<span class="from-tag">in ${(r.sharedGroups).length} group box${(r.sharedGroups).length === 1 ? '' : 'es'}</span>` : ''}
          </div>
          ${r.description ? `<p class="detail-desc">${esc(r.description)}</p>` : ''}
        </header>

        ${media.some(m => m.type !== 'audio') ? `<div class="media-strip">${media.map((m, i) =>
          m.type === 'audio' ? ''
            : m.type === 'video'
            // #t=0.1 nudges iOS Safari into showing a first frame instead of a
            // black box; the ▶ badge says "this one moves" at a glance.
            ? `<span class="video-thumb" data-media="${i}"><video class="media-thumb" src="${esc(m.url)}#t=0.1" preload="metadata" muted playsinline></video><span class="play-badge">▶</span></span>`
            : `<img class="media-thumb" src="${esc(m.url)}" data-media="${i}" alt="" loading="lazy" />`
        ).join('')}</div>` : ''}

        ${media.some(m => m.type === 'audio') ? `<section class="audio-section">
          <h2>The recording</h2>
          ${media.map((m, i) => m.type !== 'audio' ? '' : `<div class="audio-row">
            <audio controls preload="none" src="${esc(m.url)}"></audio>
            <button class="btn btn-ghost btn-sm" data-dl="${i}" title="Save the audio to this device">⬇ Save</button>
          </div>`).join('')}
        </section>` : ''}

        <div class="detail-columns">
          <section class="detail-ingredients">
            <h2>Ingredients</h2>
            <ul class="ruled">${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
          </section>
          <section class="detail-steps">
            <h2>Steps</h2>
            <ol>${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
          </section>
        </div>

        ${tipsOf(r).length ? `<section class="detail-notes"><h2>Words of wisdom</h2>
          <ul class="wisdom-list">${tipsOf(r).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      </article>
    </section>`;

  // Cross-origin <a download> is ignored by browsers, so pull the bytes and
  // hand them over as a local object URL instead.
  $$('[data-dl]').forEach(b => b.addEventListener('click', async () => {
    const m = media[Number(b.dataset.dl)];
    b.disabled = true;
    try {
      const blob = await (await fetch(m.url)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = ((m.path || '').split('/').pop() || 'recipe-audio').replace(/^\d+-/, '');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch { toast('Couldn’t fetch the audio to save it. Try again.', true); }
    b.disabled = false;
  }));

  $$('[data-media]').forEach(el => el.addEventListener('click', () => {
    const m = media[Number(el.dataset.media)];
    const body = $('#lightbox-body');
    body.innerHTML = m.type === 'video'
      ? `<video src="${esc(m.url)}" controls autoplay playsinline></video>`
      : `<img src="${esc(m.url)}" alt="" />`;
    $('#lightbox').classList.remove('hidden');
  }));

  if (!mine) {
    $('#copy-btn').addEventListener('click', async e => {
      busy(e.target, true, 'Copying…');
      try {
        const res = await Store.copyToMyBox(r);
        state.myRecipes = null;
        toast('Copied — this card is in your box now.');
        location.hash = '#/recipe/' + res.id;
      } catch (err) { toast(err.message, true); busy(e.target, false); }
    });
  }

  if (mine) {
    $('#share-btn').addEventListener('click', () => openShareModal(r));
    $('#delete-btn').addEventListener('click', async e => {
      if (!confirm(`Throw out “${r.title}”? People you shared it with lose it too. This can't be undone.`)) return;
      busy(e.target, true, '…');
      try {
        await Store.deleteRecipe(r);
        state.myRecipes = null;
        toast('Card thrown out.');
        location.hash = '#/box';
      } catch (err) { toast(err.message, true); busy(e.target, false); }
    });
  }
}

// ── Share modal ────────────────────────────────────────────────────────────

async function openShareModal(recipe) {
  $('#share-recipe-title').textContent = `“${recipe.title}”`;
  const list = $('#share-list');
  list.innerHTML = spinner('');
  openModal('share-modal');

  try {
    if (state.connections === null) state.connections = await Store.myConnections();
    if (state.groups === null) state.groups = await Store.myGroups();
  } catch (e) { list.innerHTML = errorBlock(e); return; }

  const accepted = acceptedConnections();
  const groups = state.groups || [];
  if (!accepted.length && !groups.length) {
    list.innerHTML = `<p class="muted">You're not connected with anyone yet, and you're not in any group boxes.
      <a class="linklike" href="#/people" onclick="document.getElementById('share-modal').classList.add('hidden')">Find your people →</a></p>`;
    return;
  }

  const sharedWith = new Set(recipe.sharedWith || []);
  const sharedGroups = new Set(recipe.sharedGroups || []);
  list.innerHTML = `
    ${accepted.length ? `<h3 class="share-head">People</h3>` + accepted.map(c => {
      const uid = otherUid(c);
      return `<label class="share-row">
        <input type="checkbox" data-uid="${esc(uid)}" ${sharedWith.has(uid) ? 'checked' : ''} />
        <span>${esc(otherName(c))}</span>
      </label>`;
    }).join('') : ''}
    ${groups.length ? `<h3 class="share-head">Group boxes</h3>` + groups.map(g => `
      <label class="share-row">
        <input type="checkbox" data-group="${esc(g.id)}" ${sharedGroups.has(g.id) ? 'checked' : ''} />
        <span>🗃️ ${esc(g.name)}</span>
      </label>`).join('') : ''}`;

  list.querySelectorAll('input[data-uid]').forEach(cb => cb.addEventListener('change', async () => {
    cb.disabled = true;
    try {
      await Store.setShared(recipe.id, cb.dataset.uid, cb.checked);
      if (cb.checked) sharedWith.add(cb.dataset.uid); else sharedWith.delete(cb.dataset.uid);
      recipe.sharedWith = [...sharedWith];
      state.myRecipes = null;
      toast(cb.checked ? 'Card handed over.' : 'Card taken back.');
    } catch (err) {
      cb.checked = !cb.checked;
      toast(err.message, true);
    }
    cb.disabled = false;
  }));

  list.querySelectorAll('input[data-group]').forEach(cb => cb.addEventListener('change', async () => {
    cb.disabled = true;
    const group = groups.find(g => g.id === cb.dataset.group);
    try {
      await Store.setGroupShare(recipe, group, cb.checked);
      state.myRecipes = null;
      toast(cb.checked ? `On the “${group.name}” shelf.` : `Taken off “${group.name}”.`);
    } catch (err) {
      cb.checked = !cb.checked;
      toast(err.message, true);
    }
    cb.disabled = false;
  }));
}

// ── Group boxes ────────────────────────────────────────────────────────────
// A shared shelf for a family, an event, a workplace. Everyone still has
// exactly one personal box; a group box holds *access* to cards its members
// chose to put on it. Membership is separate from friendships on purpose —
// joining the office potluck box doesn't add forty coworkers to your family.

// Shelf entries are snapshots, not full recipes — adapt for the card grid.
const entryAsCard = e => ({
  id: e.recipeId,
  title: e.title, category: e.category, description: e.description,
  ownerUsername: e.ownerUsername,
  media: [
    ...(e.photoUrl ? [{ type: 'image', url: e.photoUrl }] : []),
    ...(e.hasVideo ? [{ type: 'video' }] : []),
  ],
});

async function renderGroups(view) {
  if (state.groups === null || state.groupInvites === null) {
    view.innerHTML = spinner('Checking the shelves…');
    try {
      [state.groups, state.groupInvites] = await Promise.all([Store.myGroups(), Store.myGroupInvites()]);
    } catch (e) { view.innerHTML = errorBlock(e); return; }
  }
  updatePeopleBadge();
  const groups = state.groups, invites = state.groupInvites;

  view.innerHTML = `
    <section class="page page-narrow">
      <div class="page-head"><h1 class="hand">Group Boxes</h1></div>
      <p class="page-sub">A box the whole family — or the whole potluck — fills together. Everyone keeps
      their own box; a group box is the shared shelf you put chosen cards on. Joining one never
      touches your Family &amp; Friends list.</p>

      ${invites.length ? `<h2 class="section-head">You're invited</h2>` + invites.map(inv => `
        <div class="person-row">
          <span class="person-name">💌 <b>${esc(inv.groupName)}</b> <span class="muted">from ${esc(inv.fromName)}</span></span>
          <span class="person-actions">
            <button class="btn btn-primary btn-sm" data-accept-inv="${esc(inv.id)}">Join</button>
            <button class="btn btn-ghost btn-sm" data-decline-inv="${esc(inv.id)}">No thanks</button>
          </span>
        </div>`).join('') : ''}

      <h2 class="section-head">Your group boxes</h2>
      ${groups.length ? `<div class="group-list">` + groups.map(g => `
        <a class="group-row card-paper" href="#/group/${esc(g.id)}">
          <div class="card-topline"></div>
          <span class="group-name hand">🗃️ ${esc(g.name)}</span>
          <span class="muted">${(g.members || []).length} member${(g.members || []).length === 1 ? '' : 's'}${g.createdBy === state.user.uid ? ' · yours' : ''}</span>
        </a>`).join('') + `</div>`
      : `<p class="muted">No group boxes yet — start one below.</p>`}

      <h2 class="section-head">Start a box</h2>
      <form id="group-create-form" class="recipe-form card-paper group-create">
        <div class="card-topline"></div>
        <div class="field">
          <label for="g-name">Box name</label>
          <input id="g-name" type="text" maxlength="60" required placeholder="Cocciardi Family Recipe Box" />
        </div>
        <div class="field">
          <label for="g-invite">Invite someone <span class="opt">— every box starts with an invitation; a box for one is just a tag</span></label>
          <input id="g-invite" type="text" required placeholder="their username…" autocomplete="off" />
        </div>
        <button type="submit" class="btn btn-primary">Start the box</button>
      </form>
    </section>`;

  $$('[data-accept-inv]').forEach(b => b.addEventListener('click', async () => {
    const inv = invites.find(i => i.id === b.dataset.acceptInv);
    busy(b, true, 'Joining…');
    try {
      await Store.acceptGroupInvite(inv);
      state.groups = state.groupInvites = null;
      toast(`You're in “${inv.groupName}”.`);
      route();
    } catch (err) { toast(err.message, true); busy(b, false); }
  }));

  $$('[data-decline-inv]').forEach(b => b.addEventListener('click', async () => {
    const inv = invites.find(i => i.id === b.dataset.declineInv);
    busy(b, true, '…');
    try {
      await Store.declineGroupInvite(inv);
      state.groupInvites = null;
      route();
    } catch (err) { toast(err.message, true); busy(b, false); }
  }));

  $('#group-create-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    busy(btn, true, 'Starting…');
    try {
      const group = await Store.createGroup($('#g-name').value, $('#g-invite').value);
      state.groups = null;
      toast(`“${group.name}” is on the shelf — invite sent.`);
      location.hash = '#/group/' + group.id;
    } catch (err) { toast(err.message, true); busy(btn, false); }
  });
}

async function renderGroup(view, id) {
  view.innerHTML = spinner('Opening the box…');
  let group, cards, sentInvites = [];
  try {
    group = await Store.getGroup(id);
    if (!group) throw new Error('This box is gone, or you were taken off it.');
    cards = await Store.groupCards(id);
    if (group.createdBy === state.user.uid) sentInvites = await Store.groupInvitesSent(id).catch(() => []);
  } catch (e) { view.innerHTML = errorBlock(e); return; }

  const admin = group.createdBy === state.user.uid;
  const myCount = cards.filter(c => c.ownerUid === state.user.uid).length;
  const names = group.memberNames || {};

  view.innerHTML = `
    <section class="page">
      <div class="detail-nav"><a class="linklike" href="#/groups">← Group boxes</a>
        <span class="detail-actions">
          <button id="group-share-mine" class="btn btn-ghost btn-sm">＋ Add my cards</button>
          ${admin ? `<button id="group-delete" class="btn btn-ghost btn-sm btn-danger">🗑 Delete box</button>`
                  : `<button id="group-leave" class="btn btn-ghost btn-sm btn-danger">Leave box</button>`}
        </span>
      </div>
      <div class="page-head"><h1 class="hand">🗃️ ${esc(group.name)}</h1></div>

      <div class="member-chips">
        ${(group.members || []).map(uid => `
          <span class="member-chip">
            <a class="person-link" href="#/u/${esc(names[uid] || '')}">${esc(names[uid] || 'someone')}</a>${uid === group.createdBy ? ' ⭐' : ''}
            ${admin && uid !== state.user.uid ? `<button class="chip-x" data-remove-member="${esc(uid)}" title="Remove from box">✕</button>` : ''}
          </span>`).join('')}
        ${sentInvites.map(inv => `
          <span class="member-chip chip-pending">⏳ ${esc(inv.toName)}
            <button class="chip-x" data-revoke-inv="${esc(inv.id)}" title="Take back invite">✕</button>
          </span>`).join('')}
      </div>

      ${admin ? `<form id="group-invite-form" class="connect-form">
        <input id="group-invite-name" type="text" placeholder="invite by username…" autocomplete="off" required />
        <button type="submit" class="btn btn-ghost btn-sm">💌 Invite</button>
      </form>` : ''}

      <h2 class="section-head">On the shelf <span class="count">(${cards.length} card${cards.length === 1 ? '' : 's'}, ${myCount} yours)</span></h2>
      ${cards.length
        ? `<div class="card-grid">${cards.map(c => recipeCardHtml(entryAsCard(c), c.ownerUid === state.user.uid)).join('')}</div>`
        : `<p class="muted">Nothing on the shelf yet — add some of your cards.</p>`}
    </section>`;

  $('#group-share-mine').addEventListener('click', () => openGroupShareModal(group));

  if (admin) {
    $('#group-invite-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      busy(btn, true, '…');
      try {
        const name = await Store.inviteToGroup(group, $('#group-invite-name').value);
        toast(`Invite sent to ${name}.`);
        route();
      } catch (err) { toast(err.message, true); busy(btn, false); }
    });
    $$('[data-remove-member]').forEach(b => b.addEventListener('click', async () => {
      const uid = b.dataset.removeMember;
      if (!confirm(`Take ${names[uid] || 'them'} off this box? Their cards come off the shelf too.`)) return;
      b.disabled = true;
      try { await Store.removeGroupMember(group, uid); route(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    }));
    $$('[data-revoke-inv]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await Store.revokeGroupInvite({ id: b.dataset.revokeInv }); route(); }
      catch (err) { toast(err.message, true); b.disabled = false; }
    }));
    $('#group-delete').addEventListener('click', async e => {
      if (!confirm(`Delete “${group.name}”? Everyone loses the shelf — their own cards stay in their own boxes.`)) return;
      busy(e.target, true, '…');
      try {
        await Store.deleteGroup(group);
        state.groups = null; state.myRecipes = null;
        toast('Box deleted.');
        location.hash = '#/groups';
      } catch (err) { toast(err.message, true); busy(e.target, false); }
    });
  } else {
    $('#group-leave').addEventListener('click', async e => {
      if (!confirm(`Leave “${group.name}”? Your cards come off its shelf.`)) return;
      busy(e.target, true, '…');
      try {
        await Store.leaveGroup(group);
        state.groups = null; state.myRecipes = null;
        toast('You left the box.');
        location.hash = '#/groups';
      } catch (err) { toast(err.message, true); busy(e.target, false); }
    });
  }
}

// Checkbox list of MY cards for one group box, reusing the share modal shell.
async function openGroupShareModal(group) {
  $('#share-recipe-title').textContent = `Your cards on the “${group.name}” shelf`;
  const list = $('#share-list');
  list.innerHTML = spinner('');
  openModal('share-modal');

  try { if (state.myRecipes === null) state.myRecipes = await Store.myRecipes(); }
  catch (e) { list.innerHTML = errorBlock(e); return; }
  const mine = state.myRecipes;
  if (!mine.length) {
    list.innerHTML = `<p class="muted">Your box is empty — write a card first.</p>`;
    return;
  }

  list.innerHTML = mine.map(r => `
    <label class="share-row">
      <input type="checkbox" data-recipe="${esc(r.id)}" ${(r.sharedGroups || []).includes(group.id) ? 'checked' : ''} />
      <span>${esc(r.title)}</span>
    </label>`).join('');

  list.querySelectorAll('input[data-recipe]').forEach(cb => cb.addEventListener('change', async () => {
    cb.disabled = true;
    const recipe = mine.find(r => r.id === cb.dataset.recipe);
    try {
      await Store.setGroupShare(recipe, group, cb.checked);
      toast(cb.checked ? `“${recipe.title}” is on the shelf.` : `“${recipe.title}” taken off.`);
    } catch (err) {
      cb.checked = !cb.checked;
      toast(err.message, true);
    }
    cb.disabled = false;
  }));
}

// ── Bio page: #/u/username ─────────────────────────────────────────────────
// Someone else's page shows exactly what they've let YOU see: cards shared
// with you directly plus cards they put on shelves you both stand at — topped
// by their words of wisdom (curated by them; drawn from their cards until
// then). Your own username just goes home: My Box IS your page.

async function renderBio(view, username) {
  if (state.profile?.username
      && state.profile.username.toLowerCase() === String(username || '').toLowerCase()) {
    location.hash = '#/box';
    return;
  }
  view.innerHTML = spinner('Finding their box…');

  let person, cards = [];
  try {
    person = await Store.findUserByUsername(username);
    if (!person) {
      view.innerHTML = `<section class="page"><div class="empty-state"><h2 class="hand">No box with that name</h2>
        <p>Check the spelling — usernames are exact.</p></div></section>`;
      return;
    }
    if (state.shared === null) state.shared = await Store.sharedWithMe();
    if (state.groups === null) state.groups = await Store.myGroups();
    const seen = new Map();
    for (const r of state.shared.filter(r => r.ownerUid === person.uid)) seen.set(r.id, r);
    for (const g of state.groups) {
      const entries = await Store.groupCards(g.id).catch(() => []);
      for (const e of entries.filter(e => e.ownerUid === person.uid)) {
        if (!seen.has(e.recipeId)) seen.set(e.recipeId, entryAsCard(e));
      }
    }
    cards = [...seen.values()];
  } catch (e) { view.innerHTML = errorBlock(e); return; }

  const wisdom = (person.wisdom || []).length
    ? person.wisdom
    : cards.flatMap(tipsOf).slice(0, 3); // until they curate, their cards speak

  view.innerHTML = `
    <section class="page">
      <div class="bio-head">
        <h1 class="hand">📦 ${esc(person.username)}’s box</h1>
      </div>

      ${wisdom.length ? wisdomCardHtml(wisdom, false) : ''}

      <h2 class="section-head">Cards ${esc(person.username)} has shared with you</h2>
      ${cards.length
        ? `<div class="card-grid">${cards.map(r => recipeCardHtml(r, false)).join('')}</div>`
        : `<p class="muted">Nothing yet. Connect with ${esc(person.username)} or share a group box to swap cards.</p>`}
    </section>`;

  wireWisdomCard(wisdom, false);
}

// ── New / edit card ────────────────────────────────────────────────────────

// ── Import: photos or voice → AI → prefilled card for review ───────────────
// The heavy lifting lives in js/ai.js, dynamically imported so nobody pays
// for it until they use it. Whatever comes back lands on the normal edit
// screen (#/new) as an unsaved draft — the human always reviews before boxing.

let recState = null; // { rec, chunks, timer, startedAt, blob } while recording

function renderImport(view) {
  stopRecording(true);
  state.importDraft = null;
  const photoFiles = [];

  view.innerHTML = `
    <section class="page page-narrow">
      <div class="detail-nav"><a class="linklike" href="#/box">← Back to my box</a></div>
      <h1 class="hand">Bring a recipe in</h1>
      <p class="page-sub">Point your camera at the old card or the cookbook page — or just say the
      recipe out loud. Any language: if nonna gives it in Italian, the card comes out in Italian.
      You'll get a filled-out card to look over before it goes in your box.</p>

      <div class="import-panel card-paper">
        <div class="card-topline"></div>
        <h2 class="hand">📸 From photos</h2>
        <p class="import-sub">The handwritten card, the splattered page, the newspaper clipping —
        up to 4 photos of the same recipe. The originals get attached to the card, so the
        handwriting is never lost.</p>
        <label class="btn btn-ghost file-btn">📎 Choose or take photos
          <input id="import-photos" type="file" accept="image/*" multiple hidden />
        </label>
        <div id="import-photo-list" class="pending-files"></div>
        <div class="form-actions">
          <button id="import-photos-go" class="btn btn-primary" disabled>✨ Read the card</button>
        </div>
      </div>

      <div class="import-panel card-paper">
        <div class="card-topline"></div>
        <h2 class="hand">🎙️ By voice</h2>
        <p class="import-sub">Hit record and talk it through — ingredients, steps, the little
        secrets. Up to 5 minutes. Or bring a recording made somewhere else. Either way, the
        audio gets attached to the card, so the voice is never lost.</p>
        <div class="record-row">
          <button id="rec-btn" class="btn btn-primary">● Start recording</button>
          <span id="rec-time" class="rec-time hidden">0:00</span>
          <label class="btn btn-ghost file-btn">📎 Choose an audio file
            <input id="import-audio" type="file" accept="audio/*" hidden />
          </label>
        </div>
        <div id="rec-review" class="rec-review hidden">
          <p id="rec-name" class="rec-name"></p>
          <audio id="rec-audio" controls></audio>
          <div class="form-actions">
            <button id="rec-use" class="btn btn-primary">✨ Make my card</button>
            <a id="rec-download" class="btn btn-ghost" download>⬇ Save audio</a>
            <button id="rec-again" class="btn btn-ghost">Start over</button>
          </div>
        </div>
      </div>

      <p id="import-error" class="form-error hidden"></p>
    </section>`;

  const showError = msg => {
    const el = $('#import-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  };

  // ── Photos ──
  $('#import-photos').addEventListener('change', e => {
    for (const f of e.target.files) {
      if (!f.type.startsWith('image/')) continue;
      if (photoFiles.length < 4) photoFiles.push(f);
    }
    e.target.value = '';
    renderPhotoList();
  });

  function renderPhotoList() {
    $('#import-photo-list').innerHTML = photoFiles.map((f, i) =>
      `<span class="pending-file">📷 ${esc(f.name)}
        <button type="button" data-unqueue="${i}" title="Remove">✕</button></span>`).join('');
    $$('#import-photo-list [data-unqueue]').forEach(b => b.addEventListener('click', () => {
      photoFiles.splice(Number(b.dataset.unqueue), 1);
      renderPhotoList();
    }));
    $('#import-photos-go').disabled = !photoFiles.length;
  }

  $('#import-photos-go').addEventListener('click', async e => {
    $('#import-error').classList.add('hidden');
    busy(e.target, true, 'Reading the handwriting…');
    try {
      const AI = await import('./ai.js');
      const data = await AI.extractFromPhotos(photoFiles);
      state.importDraft = { data, files: [...photoFiles] };
      location.hash = '#/new';
    } catch (err) { showError(err.message); busy(e.target, false); }
  });

  // ── Voice ──
  $('#import-audio').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('audio/')) { showError(`“${f.name}” isn't an audio file.`); return; }
    $('#import-error').classList.add('hidden');
    stopRecording(true);
    showAudioReview(f, f.name);
  });

  $('#rec-btn').addEventListener('click', async e => {
    $('#import-error').classList.add('hidden');
    if (recState?.rec?.state === 'recording') { recState.rec.stop(); return; }
    try { await startRecording(); }
    catch (err) {
      showError(err.name === 'NotAllowedError'
        ? 'The microphone is blocked. Allow mic access for this site and try again.'
        : 'Couldn’t start the microphone: ' + err.message);
    }
  });

  $('#rec-again').addEventListener('click', () => {
    $('#rec-review').classList.add('hidden');
    recState = null;
  });

  $('#rec-use').addEventListener('click', async e => {
    if (!recState?.blob) return;
    $('#import-error').classList.add('hidden');
    busy(e.target, true, 'Listening closely…');
    try {
      const AI = await import('./ai.js');
      const data = await AI.extractFromVoice(recState.blob);
      // The recording rides along and gets attached to the card on save.
      const audio = recState.blob instanceof File ? recState.blob
        : new File([recState.blob], recState.name || 'recipe-recording.webm',
                   { type: recState.blob.type || 'audio/webm' });
      state.importDraft = { data, files: [], audio };
      recState = null;
      location.hash = '#/new';
    } catch (err) { showError(err.message); busy(e.target, false); }
  });
}

// Show a finished recording (or a chosen file) for review: playback, a
// download link so it can be saved off the phone, and "make my card".
function showAudioReview(blob, name) {
  recState = { rec: null, chunks: [], timer: null, startedAt: 0, blob, name };
  const url = URL.createObjectURL(blob);
  $('#rec-audio').src = url;
  const dl = $('#rec-download');
  dl.href = url;
  dl.download = name;
  $('#rec-name').textContent = `🎙️ ${name}`;
  $('#rec-review').classList.remove('hidden');
}

const extForMime = t => ({
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
}[(t || '').split(';')[0]] || 'webm');

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recState = { rec, chunks: [], timer: null, startedAt: Date.now(), blob: null };

  rec.ondataavailable = ev => { if (ev.data.size) recState.chunks.push(ev.data); };
  rec.onstop = () => {
    clearInterval(recState.timer);
    stream.getTracks().forEach(t => t.stop());
    const btn = $('#rec-btn'), time = $('#rec-time');
    if (btn) { btn.textContent = '● Start recording'; btn.classList.remove('recording'); }
    if (time) time.classList.add('hidden');
    const blob = new Blob(recState.chunks, { type: rec.mimeType || 'audio/webm' });
    if ($('#rec-audio') && blob.size) {
      showAudioReview(blob,
        `recipe-recording-${new Date().toISOString().slice(0, 10)}.${extForMime(blob.type)}`);
    }
  };

  rec.start();
  $('#rec-btn').textContent = '■ Stop';
  $('#rec-btn').classList.add('recording');
  $('#rec-review').classList.add('hidden');
  const time = $('#rec-time');
  time.classList.remove('hidden');
  time.textContent = '0:00';
  recState.timer = setInterval(() => {
    const s = Math.floor((Date.now() - recState.startedAt) / 1000);
    time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s >= 300) recState.rec.stop(); // 5-minute cap
  }, 500);
}

// Leaving the page mid-recording shouldn't leave the mic on.
function stopRecording(silent) {
  if (recState?.rec && recState.rec.state === 'recording') {
    try { recState.rec.stream.getTracks().forEach(t => t.stop()); recState.rec.stop(); } catch {}
  }
  if (silent) recState = null;
}

async function renderEdit(view, id) {
  let r = null;
  if (id) {
    view.innerHTML = spinner('');
    r = (state.myRecipes || []).find(x => x.id === id) || await Store.getRecipe(id).catch(() => null);
    if (!r || r.ownerUid !== state.user.uid) { location.hash = '#/box'; return; }
  }

  // An AI-read card arrives here as a prefilled, unsaved draft: same form,
  // human eyes before it goes in the box. Its photos join the upload queue
  // so the originals end up attached to the card.
  let imported = null;
  if (!id && state.importDraft) {
    imported = state.importDraft;
    state.importDraft = null;
    r = imported.data;
  }
  state.editDraft = { files: imported
    ? [...imported.files, ...(imported.audio ? [imported.audio] : [])] : [] };

  const cats = [...new Set([...(state.myRecipes || []).map(x => x.category).filter(Boolean),
                            'Dinner', 'Dessert', 'Breakfast', 'Baking', 'Sides', 'Drinks'])];

  view.innerHTML = `
    <section class="page page-narrow">
      <div class="detail-nav"><a class="linklike" href="${id ? '#/recipe/' + esc(id) : '#/box'}">← Back</a></div>
      <form id="recipe-form" class="recipe-form card-paper">
        <div class="card-topline"></div>
        <h1 class="hand">${id ? 'Edit card' : 'A new card'}</h1>
        ${imported ? `<p class="ai-note">✨ Read by AI${imported.data.language && imported.data.language !== 'English'
          ? ` — heard in ${esc(imported.data.language)}` : ''}. Give it a once-over before it goes in the box.</p>` : ''}

        <div class="field">
          <label for="f-title">Title</label>
          <input id="f-title" type="text" maxlength="90" required value="${esc(r?.title || '')}" placeholder="Grandma’s Sunday Sauce" />
        </div>

        <div class="field-row">
          <div class="field">
            <label for="f-category">Category</label>
            <input id="f-category" type="text" maxlength="30" list="cat-list" value="${esc(r?.category || '')}" placeholder="Dinner" />
            <datalist id="cat-list">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          </div>
        </div>

        <div class="field">
          <label for="f-description">One-line description <span class="opt">(optional)</span></label>
          <input id="f-description" type="text" maxlength="200" value="${esc(r?.description || '')}" placeholder="Quick, mild, and bright with lime." />
        </div>

        <div class="field">
          <label for="f-ingredients">Ingredients <span class="opt">— one per line</span></label>
          <textarea id="f-ingredients" rows="8" placeholder="1 lb large shrimp&#10;1/2 red onion, sliced&#10;…">${esc((r?.ingredients || []).join('\n'))}</textarea>
        </div>

        <div class="field">
          <label for="f-steps">Steps <span class="opt">— one per line, numbering happens by itself</span></label>
          <textarea id="f-steps" rows="10" placeholder="Heat the oil in a large skillet…&#10;Add the onion and pepper…">${esc((r?.steps || []).join('\n'))}</textarea>
        </div>

        <div class="field">
          <label for="f-tips">Words of wisdom <span class="opt">— one per line (the tips that never fit in the steps)</span></label>
          <textarea id="f-tips" rows="4" placeholder="Mom always doubles the garlic.&#10;Never open the pot before the hour is up.">${esc(tipsOf(r).join('\n'))}</textarea>
        </div>

        <div class="field">
          <label>Photos, videos &amp; audio <span class="opt">(photos ≤ 5 MB, audio ≤ 25 MB, videos ≤ 200 MB)</span></label>
          <div id="media-list" class="media-edit-list">
            ${(r?.media || []).map((m, i) => mediaEditThumb(m, i)).join('')}
          </div>
          <div class="media-add-btns">
            <label class="btn btn-ghost btn-sm file-btn">📎 Add photo / video / audio
              <input id="f-media" type="file" accept="image/*,video/*,audio/*" multiple hidden />
            </label>
            <label class="btn btn-ghost btn-sm file-btn">🎥 Record a video
              <input id="f-video-capture" type="file" accept="video/*" capture="environment" hidden />
            </label>
          </div>
          <p class="media-hint">A quick clip of the technique — how Gram mixes the dough by hand — belongs on the card. On a phone, “Record a video” opens the camera.</p>
          <div id="pending-files" class="pending-files"></div>
        </div>

        <p id="form-error" class="form-error hidden"></p>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${id ? 'Save card' : 'Put it in the box'}</button>
          <a class="btn btn-ghost" href="${id ? '#/recipe/' + esc(id) : '#/box'}">Cancel</a>
        </div>
      </form>
    </section>`;

  // Remove existing media (edit mode) — takes effect immediately.
  $$('.media-edit-remove').forEach(btn => btn.addEventListener('click', async e => {
    e.preventDefault();
    const item = (r.media || [])[Number(btn.dataset.idx)];
    if (!item || !confirm('Remove this from the card?')) return;
    btn.disabled = true;
    try {
      await Store.removeMedia(r.id, item);
      r.media = r.media.filter(m => m !== item);
      btn.closest('.media-edit-thumb').remove();
      state.myRecipes = null;
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  }));

  // Queue new files; they upload on save. The capture input is the same flow —
  // on phones it opens the camera in video mode, on desktop it's a file picker.
  ['f-media', 'f-video-capture'].forEach(fid => $('#' + fid).addEventListener('change', e => {
    for (const f of e.target.files) state.editDraft.files.push(f);
    e.target.value = '';
    renderPendingFiles();
  }));
  if (state.editDraft.files.length) renderPendingFiles(); // photos from an import

  function renderPendingFiles() {
    $('#pending-files').innerHTML = state.editDraft.files.map((f, i) =>
      `<span class="pending-file">${f.type.startsWith('video/') ? '🎬' : f.type.startsWith('audio/') ? '🎙️' : '📷'} ${esc(f.name)}
        <button type="button" data-unqueue="${i}" title="Remove">✕</button></span>`).join('');
    $$('[data-unqueue]').forEach(b => b.addEventListener('click', () => {
      state.editDraft.files.splice(Number(b.dataset.unqueue), 1);
      renderPendingFiles();
    }));
  }

  $('#recipe-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const errEl = $('#form-error');
    errEl.classList.add('hidden');
    busy(btn, true, state.editDraft.files.length ? 'Saving & uploading…' : 'Saving…');
    try {
      const data = {
        title: $('#f-title').value,
        category: $('#f-category').value,
        description: $('#f-description').value,
        ingredients: $('#f-ingredients').value.split('\n'),
        steps: $('#f-steps').value.split('\n'),
        tips: $('#f-tips').value.split('\n'),
      };
      const recipeId = await Store.saveRecipe(id, data);
      if (state.editDraft.files.length) {
        const files = state.editDraft.files;
        const items = [];
        for (const [i, f] of files.entries()) {
          items.push(await Store.uploadMedia(recipeId, f, frac => {
            btn.textContent = `Uploading ${i + 1} of ${files.length} — ${Math.round(frac * 100)}%`;
          }));
        }
        await Store.addMedia(recipeId, items);
      }
      // Keep group shelves showing the edited card (best-effort, off-path).
      if (id && (r?.sharedGroups || []).length) Store.refreshGroupCards(recipeId).catch(() => {});
      state.myRecipes = null;
      state.editDraft = null;
      toast(id ? 'Card saved.' : 'In the box!');
      location.hash = '#/recipe/' + recipeId;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      busy(btn, false);
    }
  });
}

function mediaEditThumb(m, i) {
  const inner = m.type === 'video'
    ? `<video src="${esc(m.url)}#t=0.1" preload="metadata" muted playsinline></video>`
    : m.type === 'audio'
    ? `<span class="audio-chip" title="Audio recording">🎙️</span>`
    : `<img src="${esc(m.url)}" alt="" loading="lazy" />`;
  return `<span class="media-edit-thumb">${inner}
    <button type="button" class="media-edit-remove" data-idx="${i}" title="Remove">✕</button></span>`;
}

// ── Shared bits ────────────────────────────────────────────────────────────

const spinner = msg => `<div class="spinner-wrap"><div class="spinner"></div>${msg ? `<p>${esc(msg)}</p>` : ''}</div>`;
const errorBlock = e => `<section class="page"><div class="empty-state"><h2 class="hand">Hmm.</h2>
  <p>${esc(e.message || 'Something went wrong.')}</p></div></section>`;

// ── Auth plumbing ──────────────────────────────────────────────────────────

let authMode = 'signin';

function wireAuthModal() {
  $('#google-signin-btn').addEventListener('click', async e => {
    busy(e.target, true, 'Opening Google…');
    try { await Store.signInGoogle(); closeModal('auth-modal'); }
    catch (err) { showAuthError(err); }
    busy(e.target, false);
  });

  $('#auth-mode-toggle').addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    $('#email-auth-submit').textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
    $('#auth-mode-toggle').textContent = authMode === 'signin'
      ? 'New here? Create an account' : 'Have an account? Sign in';
    $('#auth-password').autocomplete = authMode === 'signin' ? 'current-password' : 'new-password';
  });

  $('#email-auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#email-auth-submit');
    busy(btn, true, '…');
    try {
      const email = $('#auth-email').value, pw = $('#auth-password').value;
      if (authMode === 'signin') await Store.signInEmail(email, pw);
      else await Store.signUpEmail(email, pw);
      closeModal('auth-modal');
    } catch (err) { showAuthError(err); }
    busy(btn, false);
  });

  $('#auth-forgot').addEventListener('click', async () => {
    const email = $('#auth-email').value;
    if (!email) { showAuthError(new Error('Type your email above first.')); return; }
    try { await Store.resetPassword(email); toast('Reset email sent — check your inbox.'); }
    catch (err) { showAuthError(err); }
  });
}

function showAuthError(err) {
  const friendly = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email — create one below.',
    'auth/email-already-in-use': 'That email already has an account — sign in instead.',
    'auth/weak-password': 'Password needs at least 6 characters.',
    'auth/invalid-email': "That email doesn't look right.",
  }[err.code] || err.message;
  const el = $('#auth-error');
  el.textContent = friendly;
  el.classList.remove('hidden');
}

async function ensureUsername() {
  state.profile = await Store.getMyProfile().catch(() => null);
  if (state.profile?.username) return;
  openModal('username-modal');
}

function wireUsernameModal() {
  $('#username-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const errEl = $('#username-error');
    errEl.classList.add('hidden');
    busy(btn, true, 'Claiming…');
    try {
      await Store.claimUsername($('#username-input').value.trim());
      state.profile = await Store.getMyProfile();
      closeModal('username-modal');
      toast('Your box has a name on it now.');
      route();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
    busy(btn, false);
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────

window.StoreReady.then(store => {
  Store = store;

  wireAuthModal();
  wireUsernameModal();

  $('#account-btn').addEventListener('click', async () => {
    if (state.user) {
      if (confirm('Sign out? Your box stays safe here.')) await Store.signOut();
    } else {
      openModal('auth-modal');
    }
  });

  const menuBtn = $('#menu-btn');
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = document.body.classList.toggle('menu-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (document.body.classList.contains('menu-open') && !e.target.closest('#tabs')) closeMenu();
  });

  $$('.modal-close[data-close]').forEach(b =>
    b.addEventListener('click', () => closeModal(b.dataset.close)));
  $$('.modal-overlay').forEach(m => m.addEventListener('click', e => {
    if (e.target === m && m.id !== 'username-modal') m.classList.add('hidden');
  }));
  $('#lightbox-close').addEventListener('click', () => {
    $('#lightbox').classList.add('hidden');
    $('#lightbox-body').innerHTML = '';
  });
  $('#lightbox').addEventListener('click', e => {
    if (e.target.id === 'lightbox') {
      e.currentTarget.classList.add('hidden');
      $('#lightbox-body').innerHTML = '';
    }
  });

  Store.onAuth(async user => {
    state.user = user;
    state.profile = null;
    state.myRecipes = state.shared = state.connections = null;
    state.groups = state.groupInvites = null;

    $('#account-btn').textContent = user ? 'Sign out' : 'Sign in';
    $('#tabs').classList.toggle('hidden', !user);
    $('#menu-btn').classList.toggle('hidden', !user);

    if (user) {
      await ensureUsername();
      // Preload connections + group invites so the badges show without a visit.
      Store.myConnections().then(c => { state.connections = c; updatePeopleBadge(); }).catch(() => {});
      Store.myGroupInvites().then(g => { state.groupInvites = g; updatePeopleBadge(); }).catch(() => {});
    }
    route();
  });

  window.addEventListener('hashchange', route);
  route();
});
