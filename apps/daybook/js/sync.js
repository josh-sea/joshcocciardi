/* Skylight sync: sign in, then ask the daybookSkylight function for ranges.
 *
 * The Skylight token never reaches this page after it is saved. The page
 * signs in with Google, hands the token to the function once, and from then
 * on asks the function for a date range. Firebase loads only when someone
 * opens the sync settings or has connected before, so Daybook stays a
 * plain local page for everyone else.
 */

const V = '10.12.2';
const CONFIG = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

let fb = null;
const boot = async () => {
  if (fb) return fb;
  const [appMod, authMod, fnMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-functions.js`),
  ]);
  const app = appMod.initializeApp(CONFIG, 'daybook');
  const auth = authMod.getAuth(app);
  const call = fnMod.httpsCallable(fnMod.getFunctions(app, 'us-central1'), 'daybookSkylight');
  await new Promise((res) => { const off = authMod.onAuthStateChanged(auth, () => { off(); res(); }); });
  fb = { auth, authMod, call };
  return fb;
};

export const user = async () => (await boot()).auth.currentUser;

export const signIn = async () => {
  const { auth, authMod } = await boot();
  const provider = new authMod.GoogleAuthProvider();
  await authMod.signInWithPopup(auth, provider);
  return auth.currentUser;
};

export const signOut = async () => { const { auth, authMod } = await boot(); await authMod.signOut(auth); };

const call = async (data) => {
  const { call: fn } = await boot();
  try { return (await fn(data)).data; }
  catch (e) {
    const msg = String(e.message || '');
    if (/skylight_auth_failed/.test(msg)) throw new Error('Skylight turned the token down. It may have expired: copy a fresh one and connect again.');
    if (/frame_not_found/.test(msg)) throw new Error('Skylight has no calendar with that frame number.');
    if (/not_connected/.test(msg)) throw new Error('Connect Skylight first.');
    throw new Error(msg.replace(/^.*?:\s*/, '') || 'Skylight sync failed.');
  }
};

export const status = () => call({ action: 'status' });
export const connect = (token, frame, tz) => call({ action: 'connect', token, frame, tz });
export const disconnect = () => call({ action: 'disconnect' });
export const events = (dateMin, dateMax) => call({ action: 'events', dateMin, dateMax }).then((r) => r.data);

/** Pull the frame number out of a pasted Skylight URL, or take the number. */
export const parseFrame = (text) => {
  const s = String(text || '').trim();
  const m = s.match(/frames\/(\d+)/) || s.match(/^(\d+)$/);
  return m ? m[1] : null;
};

/** Ranges already fetched this session, so moving week to week does not re-ask. */
const fetched = new Map(); // "min|max" -> time
export const fresh = (min, max, ttl = 5 * 60000) => {
  const t = fetched.get(`${min}|${max}`);
  return t && Date.now() - t < ttl;
};
export const mark = (min, max) => fetched.set(`${min}|${max}`, Date.now());
export const forget = () => fetched.clear();
