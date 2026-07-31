import { db, auth } from '../config/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

/** How long to wait before giving up on a silent token request. */
const SILENT_REFRESH_TIMEOUT = 20000;

let tokenClient = null;
let pending = null;
let pendingPromise = null;
let tokenOwnerUid = null;

/**
 * Tokens are stored per Firebase user, not per email address.
 *
 * The Firebase account and the authorized mailbox are two different
 * identities — signing in with a password and then authorizing a different
 * Google account is perfectly normal — so the Firebase uid is the only key
 * both the write and the read can agree on.
 */
function tokenDocRef(uid) {
  return doc(db, 'users', uid, 'private', 'gmail');
}

/**
 * Set which Firebase user newly minted tokens belong to. Must be called
 * before requesting a token.
 */
export function setTokenOwner(uid) {
  tokenOwnerUid = uid || null;
}

/**
 * Initialize the Google Identity Services token client.
 * Must be called after the GIS script has loaded.
 */
export function initGIS() {
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not loaded');
  }
  if (!CLIENT_ID) {
    throw new Error(
      'REACT_APP_GOOGLE_CLIENT_ID is not set — see .env.example'
    );
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: GMAIL_SCOPES,
    callback: async (response) => {
      const request = takePending();
      if (!request) return;

      if (response.error) {
        request.reject(new Error(response.error_description || response.error));
        return;
      }

      try {
        const token = {
          access_token: response.access_token,
          expires_at: Date.now() + response.expires_in * 1000,
          scope: response.scope,
        };

        const profile = await fetchUserProfile(token.access_token);
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture;

        if (tokenOwnerUid) await storeToken(tokenOwnerUid, token);
        request.resolve(token);
      } catch (err) {
        request.reject(err);
      }
    },
    error_callback: (err) => {
      takePending()?.reject(new Error(err?.message || 'Authorization was dismissed'));
    },
  });
}

export function isGISReady() {
  return Boolean(tokenClient);
}

function takePending() {
  const request = pending;
  pending = null;
  pendingPromise = null;
  if (request?.timer) clearTimeout(request.timer);
  return request;
}

/**
 * Request an access token. `prompt` is '' for a silent refresh or 'consent'
 * to show the account picker. Resolves with the token, rejects on failure —
 * GIS reports errors through callbacks, never by throwing.
 *
 * Concurrent callers share one request: several Gmail calls can hit an
 * expired token at the same moment, and GIS only tolerates one in-flight
 * request. Whichever token comes back serves them all.
 */
function requestToken(prompt, timeout) {
  if (!tokenClient) {
    return Promise.reject(new Error('GIS not initialized. Call initGIS() first.'));
  }
  if (pendingPromise) return pendingPromise;

  pendingPromise = new Promise((resolve, reject) => {
    pending = { resolve, reject, timer: null };
    if (timeout) {
      pending.timer = setTimeout(() => {
        takePending()?.reject(new Error('Authorization timed out'));
      }, timeout);
    }

    try {
      tokenClient.requestAccessToken({ prompt });
    } catch (err) {
      takePending();
      reject(err);
    }
  });

  return pendingPromise;
}

/**
 * Prompt the user to authorize with Google (shows the consent screen).
 */
export function requestAuth() {
  return requestToken('consent');
}

/**
 * Silently request a new access token, without a consent prompt.
 * Works if the user has previously granted consent in this browser.
 */
export function refreshAccessToken() {
  return requestToken('', SILENT_REFRESH_TIMEOUT);
}

/**
 * Revoke the current access token.
 */
export function revokeToken(accessToken) {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
}

/**
 * Store the token in Firestore under the owning Firebase user.
 */
async function storeToken(uid, token) {
  await setDoc(
    tokenDocRef(uid),
    {
      access_token: token.access_token,
      expires_at: token.expires_at,
      scope: token.scope,
      email: token.email || '',
      name: token.name || '',
      picture: token.picture || '',
      updated_at: Date.now(),
    },
    { merge: true }
  );
}

/**
 * Load a stored token from Firestore.
 */
export async function loadStoredToken(uid) {
  if (!uid) return null;
  const snap = await getDoc(tokenDocRef(uid));
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Remove a stored token (on sign out, or when access is revoked).
 */
export async function deleteStoredToken(uid) {
  if (!uid) return;
  await deleteDoc(tokenDocRef(uid)).catch(() => {});
}

/**
 * Firebase Auth: Sign in with email and password
 */
export async function signInWithEmail(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Firebase Auth: Create account with email and password
 */
export async function signUpWithEmail(email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Firebase Auth: Sign in with Google (Firebase popup, not Gmail OAuth)
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const userCredential = await signInWithPopup(auth, provider);
  return userCredential.user;
}

/**
 * Firebase Auth: Sign out
 */
export async function signOut() {
  await firebaseSignOut(auth);
}

/**
 * Firebase Auth: Listen to auth state changes
 */
export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current Firebase user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Check if a token is still usable. Keeps a 5-minute buffer so a request
 * started now won't expire mid-flight.
 */
export function isTokenValid(token) {
  if (!token?.access_token || !token?.expires_at) return false;
  return token.expires_at > Date.now() + 5 * 60 * 1000;
}

/**
 * Get user profile info from the access token.
 */
async function fetchUserProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user profile');
  return res.json();
}
