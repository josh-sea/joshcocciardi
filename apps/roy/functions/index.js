const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.database();

// ──────────────────────────────────────────────
// Account Deletion API (for Google Play compliance)
// ──────────────────────────────────────────────
exports.deleteAccount = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify the Firebase ID token from the Authorization header
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: "Missing or invalid authorization token" });
  }

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    uid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    // 1. Delete user data from Realtime Database
    await db.ref(`/users/${uid}`).remove();

    // 2. Find and clean up any games involving this user
    const gamesSnapshot = await db.ref("/games").once("value");
    const games = gamesSnapshot.val() || {};
    const deletePromises = [];
    for (const [gameId, game] of Object.entries(games)) {
      if (game.player1 === uid || game.player2 === uid) {
        deletePromises.push(db.ref(`/games/${gameId}`).remove());
      }
    }
    await Promise.all(deletePromises);

    // 3. Delete the Firebase Auth account
    await admin.auth().deleteUser(uid);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Account deletion error:", err);
    return res.status(500).json({ error: "Failed to delete account. Please try again." });
  }
});

/**
 * Send push notifications via Expo Push API.
 * @param {Array<{to: string, title: string, body: string, data?: object}>} messages
 */
async function sendExpoPushNotifications(messages) {
  // Filter out any messages with invalid tokens
  const validMessages = messages.filter(
    (m) => m.to && typeof m.to === "string" && m.to.startsWith("ExponentPushToken")
  );

  if (validMessages.length === 0) return;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validMessages),
  });

  const result = await response.json();
  if (result.errors) {
    console.error("Expo push errors:", result.errors);
  }
  return result;
}

/**
 * Get a user's push token from the database.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function getUserPushToken(userId) {
  const snapshot = await db.ref(`/users/${userId}/pushToken`).once("value");
  return snapshot.val();
}

/**
 * Get a user's username from the database.
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function getUsername(userId) {
  const snapshot = await db.ref(`/users/${userId}/username`).once("value");
  return snapshot.val() || "Someone";
}

/**
 * Check if a user has a specific notification type enabled.
 * Defaults to true if no preferences are set.
 * @param {string} userId
 * @param {string} type - "turns", "invites", or "emotes"
 * @returns {Promise<boolean>}
 */
async function isNotificationEnabled(userId, type) {
  const snapshot = await db.ref(`/users/${userId}/notifications/${type}`).once("value");
  const val = snapshot.val();
  // Default to true if preference hasn't been set
  return val === null ? true : val === true;
}

// ──────────────────────────────────────────────
// 1. Notify opponent when it becomes their turn
// ──────────────────────────────────────────────
exports.onTurnChange = functions.database
  .ref("/games/{gameId}/turn")
  .onUpdate(async (change, context) => {
    const newTurn = change.after.val();
    const gameId = context.params.gameId;

    // Get the full game data
    const gameSnapshot = await db.ref(`/games/${gameId}`).once("value");
    const game = gameSnapshot.val();
    if (!game) return null;

    // Determine who should be notified (the player whose turn it now is)
    const recipientId = newTurn === 1 ? game.player1 : game.player2;
    // The player who just made their move
    const senderId = newTurn === 1 ? game.player2 : game.player1;

    // Don't notify if the recipient is actively in the game
    if (game.active) {
      const recipientActive = newTurn === 1
        ? game.active.player1
        : game.active.player2;
      if (recipientActive) return null;
    }

    // Check notification preference
    const enabled = await isNotificationEnabled(recipientId, "turns");
    if (!enabled) return null;

    const [pushToken, senderName] = await Promise.all([
      getUserPushToken(recipientId),
      getUsername(senderId),
    ]);

    if (!pushToken) return null;

    const gameName = game.name || "your game";

    return sendExpoPushNotifications([
      {
        to: pushToken,
        title: "Your Turn! 🎮",
        body: `${senderName} made a move in ${gameName}`,
        data: { gameId, type: "turn" },
        sound: "default",
      },
    ]);
  });

// ──────────────────────────────────────────────
// 2. Notify opponent when a new game is created
// ──────────────────────────────────────────────
exports.onGameCreated = functions.database
  .ref("/games/{gameId}")
  .onCreate(async (snapshot, context) => {
    const game = snapshot.val();
    const gameId = context.params.gameId;
    if (!game || !game.player2) return null;

    // Check notification preference
    const enabled = await isNotificationEnabled(game.player2, "invites");
    if (!enabled) return null;

    const [pushToken, senderName] = await Promise.all([
      getUserPushToken(game.player2),
      getUsername(game.player1),
    ]);

    if (!pushToken) return null;

    const gameName = game.name || "a new game";

    return sendExpoPushNotifications([
      {
        to: pushToken,
        title: "Game On! 🕹️",
        body: `${senderName} invited you to ${gameName}`,
        data: { gameId, type: "invite" },
        sound: "default",
      },
    ]);
  });

// ──────────────────────────────────────────────
// 3. Notify opponent on trash talk
// ──────────────────────────────────────────────
exports.onTrashTalk = functions.database
  .ref("/games/{gameId}/message")
  .onUpdate(async (change, context) => {
    const newMessage = change.after.val();
    const gameId = context.params.gameId;

    // Ignore cleared messages
    if (!newMessage || !newMessage.value || newMessage.sender === 0) return null;

    // Get the full game data
    const gameSnapshot = await db.ref(`/games/${gameId}`).once("value");
    const game = gameSnapshot.val();
    if (!game) return null;

    // Determine the recipient (the other player)
    const senderId = newMessage.sender === 1 ? game.player1 : game.player2;
    const recipientId = newMessage.sender === 1 ? game.player2 : game.player1;

    // Don't notify if the recipient is actively in the game
    if (game.active) {
      const recipientActive = newMessage.sender === 1
        ? game.active.player2
        : game.active.player1;
      if (recipientActive) return null;
    }

    // Check notification preference
    const enabled = await isNotificationEnabled(recipientId, "emotes");
    if (!enabled) return null;

    const [pushToken, senderName] = await Promise.all([
      getUserPushToken(recipientId),
      getUsername(senderId),
    ]);

    if (!pushToken) return null;

    return sendExpoPushNotifications([
      {
        to: pushToken,
        title: `${senderName} says...`,
        body: newMessage.value,
        data: { gameId, type: "trashtalk" },
        sound: "default",
      },
    ]);
  });
