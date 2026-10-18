import { Platform } from "react-native";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { set } from "firebase/database";
import { appAuth, royRef } from "./firebaseConfig";

// Web push through Firebase Cloud Messaging. Each browser (or installed home
// screen app) that turns notifications on gets its own FCM token, saved under
// /roy/users/{uid}/webPushTokens/{token}; the functions send to all of them
// and prune the ones FCM reports as gone.

const isWeb = Platform.OS === "web" && typeof window !== "undefined";

const isIOS = () =>
  isWeb && (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isInstalled = () =>
  isWeb && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);

// "unsupported" | "needsInstall" | "default" | "denied" | "granted"
export async function webPushStatus() {
  if (!isWeb) return "unsupported";
  // iPhone and iPad only allow web push from an app added to the home screen.
  if (isIOS() && !isInstalled()) return "needsInstall";
  if (!("Notification" in window) || !(await isSupported().catch(() => false))) return "unsupported";
  return Notification.permission;
}

async function saveToken(uid) {
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(appAuth), { serviceWorkerRegistration: registration });
  if (token) await set(royRef(`/users/${uid}/webPushTokens/${token}`), true);
  return token;
}

// Must run from a tap: browsers only show the permission prompt for a user gesture.
export async function enableWebPush(uid) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  await saveToken(uid);
  return "granted";
}

// On every app start: FCM tokens rotate, so re-save the current one when
// notifications are already on. Never prompts.
export async function refreshWebPush(uid) {
  try {
    if ((await webPushStatus()) === "granted") await saveToken(uid);
  } catch (e) {
    console.warn("[push] could not refresh the web push token:", e?.message);
  }
}
