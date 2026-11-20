// Expo push sending. Tokens live at verdict_users/{uid}/private/push.

const { db, C, FieldValue } = require('./lib');

async function push(uid, { title, body, data }) {
  const ref = db().doc(`${C.users}/${uid}/private/push`);
  const snap = await ref.get();
  const d = snap.exists ? snap.data() : {};
  const tokens = (d.tokens || []).filter((t) => /^Expo(nent)?PushToken\[/.test(t));
  if (!tokens.length || d.enabled === false) return;

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, data, sound: 'default' }))),
    });
    const out = await res.json().catch(() => ({}));
    const dead = [];
    (out.data || []).forEach((r, i) => {
      if (r.status === 'error' && r.details && r.details.error === 'DeviceNotRegistered') dead.push(tokens[i]);
    });
    if (dead.length) await ref.set({ tokens: FieldValue.arrayRemove(...dead) }, { merge: true });
  } catch (err) {
    console.error('Push failed', err.message);
  }
}

module.exports = { push };
