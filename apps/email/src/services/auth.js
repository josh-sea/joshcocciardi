import { db, auth } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// TODO: Replace with your Google Cloud Console OAuth 2.0 Client ID
const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID.apps.googleusercontent.com';

let tokenClient = null;

/**
 * Initialize the Google Identity Services token client.
 * Must be called after the GIS script has loaded.
 */
export function initGIS(onSuccess, onError) {
  if (!window.google?.accounts?.oauth2) {
    onError?.(new Error('Google Identity Services not loaded'));
    return;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: GMAIL_SCOPES,
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        onError?.(tokenResponse);
        return;
      }

      const token = {
        access_token: tokenResponse.access_token,
        expires_at: Date.now() + tokenResponse.expires_in * 1000,
        scope: tokenResponse.scope,
      };

      // Fetch user profile to get email for Firestore key
      try {
        const profile = await fetchUserProfile(token.access_token);
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture;

        await storeToken(token);
        onSuccess?.(token);
      } catch (err) {
        onError?.(err);
      }
    },
  });
}

/**
 * Prompt the user to authorize with Google.
 * Opens the Google consent/account picker.
 */
export function requestAuth() {
  if (!tokenClient) {
    throw new Error('GIS not initialized. Call initGIS() first.');
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Silently request a new access token (no consent prompt).
 * Works if the user has previously granted consent.
 */
export function refreshAccessToken() {
  if (!tokenClient) {
    throw new Error('GIS not initialized. Call initGIS() first.');
  }
  tokenClient.requestAccessToken({ prompt: '' });
}

/**
 * Revoke the current access token.
 */
export function revokeToken(accessToken) {
  if (window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
}

/**
 * Store the token in Firestore under the user's email.
 */
async function storeToken(token) {
  if (!token.email) return;
  const docRef = doc(db, 'gmail_tokens', token.email);
  await setDoc(docRef, {
    access_token: token.access_token,
    expires_at: token.expires_at,
    scope: token.scope,
    email: token.email,
    name: token.name || '',
    picture: token.picture || '',
    updated_at: Date.now(),
  }, { merge: true });
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
 * Load a stored token from Firestore.
 */
export async function loadStoredToken(email) {
  if (!email) return null;
  const docRef = doc(db, 'gmail_tokens', email);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Check if a token is still valid (not expired).
 * Adds a 5-minute buffer before actual expiration.
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
