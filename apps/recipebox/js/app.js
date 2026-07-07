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
  filterCat: '',
  editDraft: null,     // pending uploads while editing
};

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
  notes: 'If shrimp are frozen, thaw and pat very dry before cooking; excess water dilutes the sauce and prevents browning. Small or medium shrimp will cook a bit faster than large — watch for opaque, pink color rather than going by time alone.',
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

  if (!state.user) { renderLanding(view); setActiveTab(null); return; }

  const m = hash.match(/^#\/(box|shared|people|new|recipe|edit)(?:\/(.+))?$/);
  const page = m ? m[1] : 'box';
  const arg = m ? m[2] : null;

  setActiveTab(page === 'box' || page === 'new' ? 'box'
             : page === 'shared' ? 'shared'
             : page === 'people' ? 'people' : null);

  if (page === 'box')    return renderBox(view);
  if (page === 'shared') return renderShared(view);
  if (page === 'people') return renderPeople(view);
  if (page === 'new')    return renderEdit(view, null);
  if (page === 'edit')   return renderEdit(view, arg);
  if (page === 'recipe') return renderRecipe(view, arg);
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

  view.innerHTML = `
    <section class="page">
      <div class="page-head">
        <h1 class="hand">My Box <span class="count">(${recipes.length} card${recipes.length === 1 ? '' : 's'})</span></h1>
        <a class="btn btn-primary" href="#/new">✚ Write a card</a>
      </div>
      ${cats.length ? `<div class="chip-row">
        <button class="chip ${!state.filterCat ? 'active' : ''}" data-cat="">All</button>
        ${cats.map(c => `<button class="chip ${state.filterCat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>` : ''}
      <div class="card-grid">${shown.map(r => recipeCardHtml(r, true)).join('')}</div>
    </section>`;

  $$('.chip[data-cat]').forEach(ch => ch.addEventListener('click', () => {
    state.filterCat = ch.dataset.cat;
    route();
  }));
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
        <span>${(r.media || []).some(m => m.type === 'video') ? '🎬' : ''}${photo ? '📷' : ''}</span>
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
        <h2 class="owner-head hand">📦 ${esc(owner)}’s box <span class="count">(${rs.length})</span></h2>
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
      <div class="page-head"><h1 class="hand">Family &amp; Friends</h1></div>
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
          <span class="person-name">🤝 <b>${esc(otherName(c))}</b></span>
          <span class="person-actions">
            <button class="btn btn-ghost btn-sm" data-shareall="${esc(otherUid(c))}" data-name="${esc(otherName(c))}" title="Share every card in your box">Share my whole box</button>
            <button class="btn btn-ghost btn-sm btn-danger" data-remove="${esc(c.id)}" data-other="${esc(otherUid(c))}">Disconnect</button>
          </span>
        </div>`).join('')
      : `<p class="muted">No connections yet. Send a request above, or tell your family to make a box at
         <b>joshcocciardi.com/projects/recipebox</b> and ask for your username.</p>`}

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
        </span>` : ''}
      </div>

      <article class="recipe-detail card-paper">
        <div class="card-topline"></div>
        <header class="detail-head">
          <h1 class="hand">${esc(r.title)}</h1>
          <div class="detail-meta">
            ${r.category ? `<span class="cat-tag">${esc(r.category)}</span>` : ''}
            ${!mine ? `<span class="from-tag">from ${esc(r.ownerUsername || 'family')}’s box</span>` : ''}
            ${mine && (r.sharedWith || []).length ? `<span class="from-tag">shared with ${(r.sharedWith).length}</span>` : ''}
          </div>
          ${r.description ? `<p class="detail-desc">${esc(r.description)}</p>` : ''}
        </header>

        ${media.length ? `<div class="media-strip">${media.map((m, i) =>
          m.type === 'video'
            ? `<video class="media-thumb" src="${esc(m.url)}" data-media="${i}" preload="metadata" muted playsinline></video>`
            : `<img class="media-thumb" src="${esc(m.url)}" data-media="${i}" alt="" loading="lazy" />`
        ).join('')}</div>` : ''}

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

        ${r.notes ? `<section class="detail-notes"><h2>Notes</h2><p>${esc(r.notes)}</p></section>` : ''}
      </article>
    </section>`;

  $$('[data-media]').forEach(el => el.addEventListener('click', () => {
    const m = media[Number(el.dataset.media)];
    const body = $('#lightbox-body');
    body.innerHTML = m.type === 'video'
      ? `<video src="${esc(m.url)}" controls autoplay playsinline></video>`
      : `<img src="${esc(m.url)}" alt="" />`;
    $('#lightbox').classList.remove('hidden');
  }));

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

  if (state.connections === null) {
    try { state.connections = await Store.myConnections(); }
    catch (e) { list.innerHTML = errorBlock(e); return; }
  }
  const accepted = acceptedConnections();
  if (!accepted.length) {
    list.innerHTML = `<p class="muted">You're not connected with anyone yet.
      <a class="linklike" href="#/people" onclick="document.getElementById('share-modal').classList.add('hidden')">Find your people →</a></p>`;
    return;
  }

  const sharedWith = new Set(recipe.sharedWith || []);
  list.innerHTML = accepted.map(c => {
    const uid = otherUid(c);
    return `<label class="share-row">
      <input type="checkbox" data-uid="${esc(uid)}" ${sharedWith.has(uid) ? 'checked' : ''} />
      <span>${esc(otherName(c))}</span>
    </label>`;
  }).join('');

  list.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', async () => {
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
}

// ── New / edit card ────────────────────────────────────────────────────────

async function renderEdit(view, id) {
  let r = null;
  if (id) {
    view.innerHTML = spinner('');
    r = (state.myRecipes || []).find(x => x.id === id) || await Store.getRecipe(id).catch(() => null);
    if (!r || r.ownerUid !== state.user.uid) { location.hash = '#/box'; return; }
  }
  state.editDraft = { files: [] };

  const cats = [...new Set([...(state.myRecipes || []).map(x => x.category).filter(Boolean),
                            'Dinner', 'Dessert', 'Breakfast', 'Baking', 'Sides', 'Drinks'])];

  view.innerHTML = `
    <section class="page page-narrow">
      <div class="detail-nav"><a class="linklike" href="${id ? '#/recipe/' + esc(id) : '#/box'}">← Back</a></div>
      <form id="recipe-form" class="recipe-form card-paper">
        <div class="card-topline"></div>
        <h1 class="hand">${id ? 'Edit card' : 'A new card'}</h1>

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
          <label for="f-notes">Notes <span class="opt">(optional — the wisdom that never fits in the steps)</span></label>
          <textarea id="f-notes" rows="3" placeholder="Mom always doubles the garlic.">${esc(r?.notes || '')}</textarea>
        </div>

        <div class="field">
          <label>Photos &amp; videos <span class="opt">(photos ≤ 5 MB, videos ≤ 50 MB)</span></label>
          <div id="media-list" class="media-edit-list">
            ${(r?.media || []).map((m, i) => mediaEditThumb(m, i)).join('')}
          </div>
          <label class="btn btn-ghost btn-sm file-btn">📎 Add photo / video
            <input id="f-media" type="file" accept="image/*,video/*" multiple hidden />
          </label>
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

  // Queue new files; they upload on save.
  $('#f-media').addEventListener('change', e => {
    for (const f of e.target.files) state.editDraft.files.push(f);
    e.target.value = '';
    renderPendingFiles();
  });

  function renderPendingFiles() {
    $('#pending-files').innerHTML = state.editDraft.files.map((f, i) =>
      `<span class="pending-file">${f.type.startsWith('video/') ? '🎬' : '📷'} ${esc(f.name)}
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
        notes: $('#f-notes').value,
      };
      const recipeId = await Store.saveRecipe(id, data);
      if (state.editDraft.files.length) {
        const items = [];
        for (const f of state.editDraft.files) items.push(await Store.uploadMedia(recipeId, f));
        await Store.addMedia(recipeId, items);
      }
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
    ? `<video src="${esc(m.url)}" preload="metadata" muted playsinline></video>`
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

    $('#account-btn').textContent = user ? 'Sign out' : 'Sign in';
    $('#tabs').classList.toggle('hidden', !user);

    if (user) {
      await ensureUsername();
      // Preload connections so the pending-request badge shows without a visit.
      Store.myConnections().then(c => { state.connections = c; updatePeopleBadge(); }).catch(() => {});
    }
    route();
  });

  window.addEventListener('hashchange', route);
  route();
});
