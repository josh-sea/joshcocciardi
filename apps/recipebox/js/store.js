// Firebase auth + Firestore + Storage persistence for Recipe Box.
// Loaded as a <script type="module">; exposes window.Store and resolves
// window.StoreReady (created inline in index.html before any script runs).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, serverTimestamp,
  arrayUnion, arrayRemove, deleteField,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// Complete a Google redirect sign-in if we're returning from one.
getRedirectResult(auth).catch(e => console.warn('[Store] redirect result:', e.message));

function _uid() {
  if (!auth.currentUser) throw new Error('Sign in to use your recipe box.');
  return auth.currentUser.uid;
}

const _recipesCol      = () => collection(db, 'recipebox_recipes');
const _connectionsCol  = () => collection(db, 'recipebox_connections');
const _groupsCol       = () => collection(db, 'recipebox_groups');
const _groupInvitesCol = () => collection(db, 'recipebox_group_invites');
const _groupCardsCol   = groupId => collection(db, 'recipebox_groups', groupId, 'cards');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Security rules check group membership with a fixed number of lookups, so a
// card can sit in at most this many group boxes at once.
const MAX_GROUPS_PER_RECIPE = 4;

// Mirrors the limits enforced by storage.rules.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

// Profile cache so every save doesn't re-fetch it.
let _profileCache = null;
let _profileCacheUid = null;

const Store = {
  currentUser() { return auth.currentUser; },

  onAuth(cb) { return onAuthStateChanged(auth, cb); },

  async signInGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      // Popups are often blocked on mobile / in PWAs — fall back to redirect.
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' ||
          e.code === 'auth/cancelled-popup-request' || e.code === 'auth/operation-not-supported-in-this-environment') {
        if (e.code === 'auth/popup-closed-by-user') return; // user changed their mind
        await signInWithRedirect(auth, provider);
      } else {
        throw e;
      }
    }
  },

  async signInEmail(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  },

  async signUpEmail(email, password) {
    await createUserWithEmailAndPassword(auth, email, password);
  },

  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  },

  async signOut() { await signOut(auth); },

  // ── Profiles: recipebox_users/{uid} + recipebox_usernames/{lowercase} ────
  // Usernames are how family members find each other — emails are never
  // displayed or stored in any shared document.

  async getMyProfile() {
    if (!auth.currentUser) return null;
    const uid = auth.currentUser.uid;
    if (_profileCache && _profileCacheUid === uid) return _profileCache;
    const snap = await getDoc(doc(db, 'recipebox_users', uid));
    const profile = snap.exists() ? snap.data() : null;
    if (profile) { _profileCache = profile; _profileCacheUid = uid; }
    return profile;
  },

  validateUsername(username) {
    if (!USERNAME_RE.test(username || '')) {
      throw new Error('Username must be 3–20 characters: letters, numbers, underscores.');
    }
  },

  async claimUsername(username) {
    const uid = _uid();
    this.validateUsername(username);
    const key = username.toLowerCase();
    const nameRef = doc(db, 'recipebox_usernames', key);
    const snap = await getDoc(nameRef);
    if (snap.exists() && snap.data().uid !== uid) {
      throw new Error('That username is taken — try another.');
    }
    if (!snap.exists()) {
      await setDoc(nameRef, { uid, createdAt: serverTimestamp() });
    }
    await setDoc(doc(db, 'recipebox_users', uid), {
      username, updatedAt: serverTimestamp(),
    }, { merge: true });
    _profileCache = { username };
    _profileCacheUid = uid;
    return username;
  },

  async findUserByUsername(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    const snap = await getDoc(doc(db, 'recipebox_usernames', key));
    if (!snap.exists()) return null;
    const uid = snap.data().uid;
    const prof = await getDoc(doc(db, 'recipebox_users', uid));
    return {
      uid,
      username: prof.exists() ? prof.data().username : key,
      wisdom: prof.exists() ? (prof.data().wisdom || []) : [],
    };
  },

  // Curated "words of wisdom" shown on your page — your call, your order.
  async saveWisdom(list) {
    const uid = _uid();
    const wisdom = (list || []).map(s => String(s).trim()).filter(Boolean).slice(0, 20);
    await setDoc(doc(db, 'recipebox_users', uid), { wisdom, updatedAt: serverTimestamp() }, { merge: true });
    if (_profileCache && _profileCacheUid === uid) _profileCache.wisdom = wisdom;
    return wisdom;
  },

  // ── Connections: recipebox_connections/{uidA__uidB} (uids sorted) ────────
  // A connection is the electronic handshake that sharing is gated by:
  // one side requests, the other accepts, either side can end it.

  connectionId(a, b) { return [a, b].sort().join('__'); },

  async myConnections() {
    const snap = await getDocs(query(_connectionsCol(), where('users', 'array-contains', _uid())));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  },

  async requestConnection(username) {
    const uid = _uid();
    const me = await this.getMyProfile();
    if (!me?.username) throw new Error('Pick a username before connecting with family.');
    const them = await this.findUserByUsername(username);
    if (!them) throw new Error(`No one named “${username}” here yet — check the spelling, or invite them to make a box.`);
    if (them.uid === uid) throw new Error("That's you! Find a family member or friend instead.");

    const id = this.connectionId(uid, them.uid);
    const ref = doc(_connectionsCol(), id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const c = existing.data();
      throw new Error(c.status === 'accepted'
        ? `You're already connected with ${them.username}.`
        : `There's already a pending request between you and ${them.username}.`);
    }

    await setDoc(ref, {
      users: [uid, them.uid].sort(),
      usernames: { [uid]: me.username, [them.uid]: them.username },
      requestedBy: uid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return them.username;
  },

  async acceptConnection(connectionId) {
    await updateDoc(doc(_connectionsCol(), connectionId), {
      status: 'accepted',
      respondedAt: serverTimestamp(),
    });
  },

  // Decline / cancel / disconnect. Also pulls the other person off any of my
  // cards first (best-effort) so a broken connection doesn't leave cards shared.
  async removeConnection(connectionId, otherUid) {
    if (otherUid) {
      try {
        const mine = await this.myRecipes();
        await Promise.all(
          mine.filter(r => (r.sharedWith || []).includes(otherUid))
              .map(r => updateDoc(doc(_recipesCol(), r.id), { sharedWith: arrayRemove(otherUid) }))
        );
      } catch (e) { console.warn('[Store] unshare on disconnect:', e.message); }
    }
    await deleteDoc(doc(_connectionsCol(), connectionId));
  },

  // ── Recipes: recipebox_recipes/{recipeId} ────────────────────────────────
  // One doc per card. `sharedWith` lists the uids of connections the owner
  // has handed the card to; security rules let exactly those people read it.
  // Queries filter by a single field so no composite indexes are needed —
  // sorting happens client-side.

  async myRecipes() {
    const snap = await getDocs(query(_recipesCol(), where('ownerUid', '==', _uid())));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  },

  async sharedWithMe() {
    const snap = await getDocs(query(_recipesCol(), where('sharedWith', 'array-contains', _uid())));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  },

  async getRecipe(recipeId) {
    const snap = await getDoc(doc(_recipesCol(), recipeId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  // Create (id = null) or update a card. Returns the recipe id.
  async saveRecipe(recipeId, data) {
    const uid = _uid();
    const clean = {
      title: (data.title || '').trim(),
      category: (data.category || '').trim(),
      description: (data.description || '').trim(),
      ingredients: (data.ingredients || []).map(s => s.trim()).filter(Boolean),
      steps: (data.steps || []).map(s => s.trim()).filter(Boolean),
      // Words of wisdom — a list, like ingredients. Saving through the form
      // migrates any old freeform `notes` prose into it (the form prefills
      // notes as the first tip), so notes is cleared here.
      tips: (data.tips || []).map(s => s.trim()).filter(Boolean),
      notes: '',
      updatedAt: serverTimestamp(),
    };
    if (!clean.title) throw new Error('Every card needs a title.');

    if (recipeId) {
      await updateDoc(doc(_recipesCol(), recipeId), clean);
      return recipeId;
    }
    const me = await this.getMyProfile();
    const ref = await addDoc(_recipesCol(), {
      ...clean,
      ownerUid: uid,
      ownerUsername: me?.username || '',
      media: [],
      sharedWith: [],
      sharedGroups: [],
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  // Copy a card someone shared with me into my own box, so it survives even
  // if the original is unshared, thrown out, or the owner's account goes
  // away. Media bytes are re-uploaded into MY storage (best-effort) — a copy
  // that still points at the original owner's files wouldn't outlive them.
  async copyToMyBox(recipe) {
    const uid = _uid();
    const me = await this.getMyProfile();
    const ref = await addDoc(_recipesCol(), {
      title: recipe.title || 'Untitled',
      category: recipe.category || '',
      description: recipe.description || '',
      ingredients: [...(recipe.ingredients || [])],
      steps: [...(recipe.steps || [])],
      tips: (recipe.tips?.length ? [...recipe.tips] : (recipe.notes ? [recipe.notes] : [])),
      copiedFrom: recipe.ownerUsername || '',
      ownerUid: uid,
      ownerUsername: me?.username || '',
      media: [],
      sharedWith: [],
      sharedGroups: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const copied = [];
    for (const m of (recipe.media || [])) {
      try {
        const resp = await fetch(m.url);
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        const blob = await resp.blob();
        const contentType = blob.type || (m.type === 'video' ? 'video/mp4' : 'image/jpeg');
        const baseName = (m.path || '').split('/').pop() || `${m.type}-${copied.length}`;
        const path = `users/${uid}/recipebox/${ref.id}/${Date.now()}-${baseName}`;
        const sref = storageRef(storage, path);
        await uploadBytes(sref, blob, { contentType });
        copied.push({ url: await getDownloadURL(sref), path, type: m.type });
      } catch (e) {
        console.warn('[Store] media copy failed:', e.message);
      }
    }
    if (copied.length) {
      await updateDoc(doc(_recipesCol(), ref.id), { media: copied });
    }
    return { id: ref.id, copiedMedia: copied.length, totalMedia: (recipe.media || []).length };
  },

  async deleteRecipe(recipe) {
    await Promise.all(
      (recipe.media || [])
        .filter(m => m.path)
        .map(m => deleteObject(storageRef(storage, m.path)).catch(() => {}))
    );
    // Take it off any group shelves too (best-effort).
    await Promise.all((recipe.sharedGroups || []).map(g =>
      deleteDoc(doc(_groupCardsCol(g), recipe.id)).catch(() => {})));
    await deleteDoc(doc(_recipesCol(), recipe.id));
  },

  async setShared(recipeId, otherUid, on) {
    await updateDoc(doc(_recipesCol(), recipeId), {
      sharedWith: on ? arrayUnion(otherUid) : arrayRemove(otherUid),
    });
  },

  // Hand someone the whole box. Returns how many cards were newly shared.
  async shareAllWith(otherUid) {
    const mine = await this.myRecipes();
    const todo = mine.filter(r => !(r.sharedWith || []).includes(otherUid));
    await Promise.all(todo.map(r =>
      updateDoc(doc(_recipesCol(), r.id), { sharedWith: arrayUnion(otherUid) })
    ));
    return todo.length;
  },

  // ── Group boxes: recipebox_groups/{id} + cards subcollection ─────────────
  // A group box is a shared shelf, not a second personal box: everyone keeps
  // exactly one box of their own and puts *access* to chosen cards on the
  // shelf. Membership is its own trust circle — joining a box never touches
  // anyone's friends list. Invites go by username, accept/decline like
  // connections; only the creator (admin) invites and removes.
  //
  // The `cards` subcollection is an index of what's on the shelf: snapshot
  // fields for the grid, with the recipe doc staying the source of truth
  // (readable by members via the recipe's sharedGroups + rules).

  async myGroups() {
    const snap = await getDocs(query(_groupsCol(), where('members', 'array-contains', _uid())));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  },

  async getGroup(groupId) {
    const snap = await getDoc(doc(_groupsCol(), groupId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  // Every box starts with an invitation — a box for one is just a tag.
  async createGroup(name, inviteUsername) {
    const uid = _uid();
    const me = await this.getMyProfile();
    if (!me?.username) throw new Error('Pick a username before making a group box.');
    const clean = String(name || '').trim();
    if (clean.length < 2 || clean.length > 60) throw new Error('Give the box a name (2–60 characters).');
    const them = await this.findUserByUsername(inviteUsername);
    if (!them) throw new Error(`No one named “${inviteUsername}” here yet — a group box starts with at least one real invite.`);
    if (them.uid === uid) throw new Error('Invite someone other than yourself — a box for one is just a tag.');

    const ref = await addDoc(_groupsCol(), {
      name: clean,
      createdBy: uid,
      members: [uid],
      memberNames: { [uid]: me.username },
      createdAt: serverTimestamp(),
    });
    const group = { id: ref.id, name: clean, createdBy: uid, members: [uid] };
    await this.inviteToGroup(group, them.username);
    return group;
  },

  async inviteToGroup(group, username) {
    const uid = _uid();
    const me = await this.getMyProfile();
    const them = await this.findUserByUsername(username);
    if (!them) throw new Error(`No one named “${username}” here yet — check the spelling, or invite them to make a box.`);
    if (them.uid === uid) throw new Error("That's you — you're already in it.");
    if ((group.members || []).includes(them.uid)) throw new Error(`${them.username} is already in this box.`);

    const ref = doc(_groupInvitesCol(), `${group.id}__${them.uid}`);
    const existing = await getDoc(ref);
    if (existing.exists()) throw new Error(`${them.username} already has an invite to this box.`);
    await setDoc(ref, {
      groupId: group.id,
      groupName: group.name,
      from: uid,
      fromName: me?.username || '',
      to: them.uid,
      toName: them.username,
      createdAt: serverTimestamp(),
    });
    return them.username;
  },

  async myGroupInvites() {
    const snap = await getDocs(query(_groupInvitesCol(), where('to', '==', _uid())));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  },

  // Invites I've sent (for showing "waiting on them" inside a box I admin).
  async groupInvitesSent(groupId) {
    const snap = await getDocs(query(_groupInvitesCol(), where('from', '==', _uid())));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(inv => inv.groupId === groupId);
  },

  async acceptGroupInvite(invite) {
    const uid = _uid();
    const me = await this.getMyProfile();
    // Join while the invite still exists — the rules use it as the ticket in.
    await updateDoc(doc(_groupsCol(), invite.groupId), {
      members: arrayUnion(uid),
      [`memberNames.${uid}`]: me?.username || '',
    });
    await deleteDoc(doc(_groupInvitesCol(), invite.id));
  },

  async declineGroupInvite(invite) {
    await deleteDoc(doc(_groupInvitesCol(), invite.id));
  },

  async revokeGroupInvite(invite) {
    await deleteDoc(doc(_groupInvitesCol(), invite.id));
  },

  // Leaving takes your cards off the shelf first, so nothing of yours stays
  // behind in a box you're no longer part of.
  async leaveGroup(group) {
    const uid = _uid();
    try {
      const mine = await this.myRecipes();
      await Promise.all(mine
        .filter(r => (r.sharedGroups || []).includes(group.id))
        .map(r => this.setGroupShare(r, group, false).catch(() => {})));
    } catch (e) { console.warn('[Store] unshare on leave:', e.message); }
    await updateDoc(doc(_groupsCol(), group.id), {
      members: arrayRemove(uid),
      [`memberNames.${uid}`]: deleteField(),
    });
  },

  // Admin only. Clears the member's shelf entries so the box UI is honest;
  // their recipe docs keep the stale group id until they next touch sharing,
  // which is harmless once the entries are gone from the shelf.
  async removeGroupMember(group, memberUid) {
    try {
      const cards = await this.groupCards(group.id);
      await Promise.all(cards
        .filter(c => c.ownerUid === memberUid)
        .map(c => deleteDoc(doc(_groupCardsCol(group.id), c.recipeId)).catch(() => {})));
    } catch (e) { console.warn('[Store] clear cards on remove:', e.message); }
    await updateDoc(doc(_groupsCol(), group.id), {
      members: arrayRemove(memberUid),
      [`memberNames.${memberUid}`]: deleteField(),
    });
  },

  // Admin only. Once the group doc is gone, the rules fail closed for any
  // recipe still pointing at it, so stale sharedGroups ids leak nothing.
  async deleteGroup(group) {
    const uid = _uid();
    try {
      const mine = await this.myRecipes();
      await Promise.all(mine
        .filter(r => (r.sharedGroups || []).includes(group.id))
        .map(r => updateDoc(doc(_recipesCol(), r.id), { sharedGroups: arrayRemove(group.id) }).catch(() => {})));
      const cards = await this.groupCards(group.id);
      await Promise.all(cards.map(c => deleteDoc(doc(_groupCardsCol(group.id), c.recipeId)).catch(() => {})));
    } catch (e) { console.warn('[Store] cleanup on delete group:', e.message); }
    await deleteDoc(doc(_groupsCol(), group.id));
  },

  async groupCards(groupId) {
    const snap = await getDocs(_groupCardsCol(groupId));
    return snap.docs
      .map(d => ({ ...d.data() }))
      .sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
  },

  _cardSnapshot(recipe, username) {
    const photo = (recipe.media || []).find(m => m.type === 'image');
    return {
      recipeId: recipe.id,
      ownerUid: recipe.ownerUid,
      ownerUsername: recipe.ownerUsername || username || '',
      title: recipe.title || '',
      category: recipe.category || '',
      description: recipe.description || '',
      photoUrl: photo?.url || '',
      hasVideo: (recipe.media || []).some(m => m.type === 'video'),
      addedAt: serverTimestamp(),
    };
  },

  // Put one of my cards on a group shelf, or take it off.
  async setGroupShare(recipe, group, on) {
    const current = recipe.sharedGroups || [];
    if (on && !current.includes(group.id) && current.length >= MAX_GROUPS_PER_RECIPE) {
      throw new Error(`A card can sit in at most ${MAX_GROUPS_PER_RECIPE} group boxes.`);
    }
    if (on) {
      await updateDoc(doc(_recipesCol(), recipe.id), { sharedGroups: arrayUnion(group.id) });
      const me = await this.getMyProfile();
      await setDoc(doc(_groupCardsCol(group.id), recipe.id), this._cardSnapshot(recipe, me?.username));
      recipe.sharedGroups = [...new Set([...current, group.id])];
    } else {
      await deleteDoc(doc(_groupCardsCol(group.id), recipe.id)).catch(() => {});
      await updateDoc(doc(_recipesCol(), recipe.id), { sharedGroups: arrayRemove(group.id) });
      recipe.sharedGroups = current.filter(g => g !== group.id);
    }
  },

  // Put my whole box on the shelf. Returns how many cards were newly added.
  async shareAllToGroup(group) {
    const mine = await this.myRecipes();
    const todo = mine.filter(r => !(r.sharedGroups || []).includes(group.id)
                              && (r.sharedGroups || []).length < MAX_GROUPS_PER_RECIPE);
    for (const r of todo) await this.setGroupShare(r, group, true);
    return todo.length;
  },

  // After editing a card, refresh its snapshot on any shelves it sits on.
  async refreshGroupCards(recipeId) {
    const recipe = await this.getRecipe(recipeId);
    if (!recipe || !(recipe.sharedGroups || []).length) return;
    const me = await this.getMyProfile();
    await Promise.all(recipe.sharedGroups.map(g =>
      setDoc(doc(_groupCardsCol(g), recipe.id), this._cardSnapshot(recipe, me?.username)).catch(() => {})));
  },

  // ── Media: Storage at users/{uid}/recipebox/{recipeId}/… ─────────────────
  // Docs store tokenized download URLs, so people a card is shared with can
  // see its photos and videos without extra storage rules.

  async uploadMedia(recipeId, file) {
    const uid = _uid();
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) throw new Error(`“${file.name}” isn't a photo or video.`);
    if (isImage && file.size > IMAGE_MAX_BYTES) throw new Error(`Photos are capped at 5 MB — “${file.name}” is too big.`);
    if (isVideo && file.size > VIDEO_MAX_BYTES) throw new Error(`Videos are capped at 50 MB — “${file.name}” is too big.`);

    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-60);
    const path = `users/${uid}/recipebox/${recipeId}/${Date.now()}-${safeName}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file, { contentType: file.type });
    const url = await getDownloadURL(ref);
    return { url, path, type: isVideo ? 'video' : 'image' };
  },

  async addMedia(recipeId, items) {
    if (!items.length) return;
    await updateDoc(doc(_recipesCol(), recipeId), { media: arrayUnion(...items) });
  },

  async removeMedia(recipeId, item) {
    await updateDoc(doc(_recipesCol(), recipeId), { media: arrayRemove(item) });
    if (item.path) await deleteObject(storageRef(storage, item.path)).catch(() => {});
  },
};

window.Store = Store;
window.__storeResolve?.(Store);
