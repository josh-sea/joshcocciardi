/* Park Planner: signing in, so the plan outlives the browser.
 *
 * The planner kept everything in localStorage, which is the right default
 * and a bad only-option. Safari evicts script-written storage for a site you
 * do not open most days, which is exactly what planning a trip a year out
 * looks like, and nothing in localStorage reaches a second phone.
 *
 * Anonymous sign-in, which the photo game uses, does not fix either: the
 * anonymous account id lives in the same storage that gets cleared, so
 * losing it loses the account. This needs an identity you can prove again
 * from anywhere, which means Google or an emailed link.
 *
 * Two ways in on purpose. Google is one tap on a phone already signed into
 * it; the link is for a browser that is not, and needs no password to
 * forget. Both land on the same account when they carry the same address,
 * because Firebase treats a verified email as the identity.
 *
 * Deliberately NOT anonymous-by-default here. The planner works signed out,
 * on this device, exactly as before. Signing in is what adds durability,
 * and an account nobody asked for is a worse default than none.
 */

import {
  initializeApp, getApps, getApp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, getRedirectResult, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDg4KwFy06tmJ9T_rop8Q10_9mPjfOYrxc',
  authDomain: 'josh-cocciardi.firebaseapp.com',
  projectId: 'josh-cocciardi',
  storageBucket: 'josh-cocciardi.firebasestorage.app',
  messagingSenderId: '21223323384',
  appId: '1:21223323384:web:2df2e363a8a4a52adaed0d',
};

/* The photo game initialises the same app. Whichever module loads first
 * wins and the other reuses it, rather than throwing duplicate-app.
 */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const EMAIL_KEY = 'parkPlanner.signInEmail';

/* Who is signed in, as the planner cares about it: a real account, or
 * nobody. An anonymous session left over from the photo game is not an
 * account you can prove again, so it counts as nobody here and the planner
 * stays local for it.
 */
export const named = (user) => !!user && !user.isAnonymous;

export function watch(onChange) {
  return onAuthStateChanged(auth, (user) => onChange(named(user) ? user : null));
}

export const currentUser = () => (named(auth.currentUser) ? auth.currentUser : null);

/* Google. Popup first, because it keeps the page and its state; iOS Safari
 * blocks popups often enough that a redirect has to be the fallback rather
 * than an error message.
 */
export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    const code = err && err.code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return null;  // the page goes away; finishSignIn picks it up on return
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
    throw err;
  }
}

/* The emailed link.
 *
 * The address is kept so the second half can check that the link is being
 * opened by whoever asked for it. If it is not there, because the link was
 * opened on another device, the caller asks for the address again rather
 * than failing: that is the one case Firebase cannot resolve on its own.
 */
export async function sendLink(email, url = window.location.href) {
  const clean = String(email || '').trim();
  if (!clean.includes('@')) throw new Error('That does not look like an email address.');
  await sendSignInLinkToEmail(auth, clean, { url, handleCodeInApp: true });
  try { localStorage.setItem(EMAIL_KEY, clean); } catch { /* private mode */ }
  return clean;
}

export const linkPending = (href = window.location.href) => isSignInWithEmailLink(auth, href);

export const rememberedEmail = () => {
  try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
};

/* Finish whichever sign-in was in flight: a redirect coming back, or an
 * emailed link being opened. Returns the user, or null when there was
 * nothing to finish, or the string 'need-email' when a link was opened on a
 * device that never asked for it.
 */
export async function finishSignIn(href = window.location.href) {
  try {
    const redirect = await getRedirectResult(auth);
    if (redirect && redirect.user) return redirect.user;
  } catch { /* nothing in flight, or it failed: fall through to the link */ }

  if (!isSignInWithEmailLink(auth, href)) return null;
  const email = rememberedEmail();
  if (!email) return 'need-email';
  return completeLink(email, href);
}

export async function completeLink(email, href = window.location.href) {
  const cred = await signInWithEmailLink(auth, String(email || '').trim(), href);
  try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
  // Strip the one-time credential out of the address bar so a reload, or a
  // shared URL, is not a second attempt at a link that is already spent.
  try {
    const url = new URL(href);
    for (const p of ['apiKey', 'oobCode', 'mode', 'lang', 'continueUrl', 'tenantId']) {
      url.searchParams.delete(p);
    }
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
  return cred.user;
}

export const signOutNow = () => signOut(auth);
