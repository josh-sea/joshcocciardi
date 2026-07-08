// Recipe Box AI import — turns photos of recipe cards/cookbook pages, or a
// voice recording of someone talking through a recipe, into structured card
// data. Loaded lazily (dynamic import from app.js) so the app costs nothing
// extra until someone actually imports.
//
// This module is the only place that knows which AI is behind the curtain
// (currently Gemini via Firebase AI Logic — no API key ships to the client,
// access is gated by the Firebase project). To move a path to a different
// provider later (e.g. Claude for photos), swap the internals here; the UI
// only calls extractFromPhotos()/extractFromVoice().

import { getApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-ai.js';

const RECIPE_SCHEMA = Schema.object({
  properties: {
    found: Schema.boolean(),
    title: Schema.string(),
    category: Schema.string(),
    description: Schema.string(),
    ingredients: Schema.array({ items: Schema.string() }),
    steps: Schema.array({ items: Schema.string() }),
    notes: Schema.string(),
    language: Schema.string(),
  },
});

const RULES = `
You are helping someone preserve a family recipe in an electronic recipe box.
Produce exactly one recipe card.

Rules:
- Keep the cook's own words and voice. Tidy up, don't rewrite.
- The recipe may be in ANY language. Keep the whole card in its original
  language — do NOT translate. Set "language" to the English name of that
  language (e.g. "Italian", "Spanish", "English").
- "ingredients": one entry per ingredient, quantities exactly as given.
- "steps": one entry per step, in cooking order, no numbering prefixes.
- "notes": the asides — tips, warnings, substitutions, family wisdom.
- "description": one short appetizing line, in the recipe's language.
- "category": one English word like Dinner, Dessert, Breakfast, Baking, Bread,
  Sides, Drinks, Sauce.
- If a word is illegible or unclear, give your best guess followed by "(?)".
- If there is no recipe present at all, set found=false and leave the other
  fields empty.`;

let _model = null;
function model() {
  if (!_model) {
    const ai = getAI(getApp(), { backend: new GoogleAIBackend() });
    _model = getGenerativeModel(ai, {
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RECIPE_SCHEMA,
        temperature: 0.2,
      },
    });
  }
  return _model;
}

// ── Input plumbing ─────────────────────────────────────────────────────────

const blobToBase64 = blob => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1]);
  fr.onerror = () => reject(new Error('Could not read the file.'));
  fr.readAsDataURL(blob);
});

async function toPart(blob, mimeType) {
  return { inlineData: { data: await blobToBase64(blob), mimeType } };
}

// Photos get shrunk before they go to the model — the model doesn't need a
// 12-megapixel scan to read handwriting, and inline requests have size
// limits. The ORIGINAL file is what gets attached to the card, untouched.
async function shrinkPhoto(file, maxEdge = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) { bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return out || file;
  } catch { return file; } // undecodable here ≠ undecodable by the model
}

// ── The two entry points ───────────────────────────────────────────────────

async function run(parts, taskIntro) {
  let result;
  try {
    result = await model().generateContent([{ text: taskIntro + '\n' + RULES }, ...parts]);
  } catch (e) {
    throw new Error(friendly(e));
  }
  let data;
  try { data = JSON.parse(result.response.text()); }
  catch { throw new Error("The AI's answer didn't come back as a card. Try again — it usually works the second time."); }
  if (!data.found || !String(data.title || '').trim()) {
    throw new Error("Couldn't find a recipe in that. Try clearer photos, or start the recording with the recipe's name.");
  }
  return {
    title: data.title || '',
    category: data.category || '',
    description: data.description || '',
    ingredients: (data.ingredients || []).map(s => String(s).trim()).filter(Boolean),
    steps: (data.steps || []).map(s => String(s).trim()).filter(Boolean),
    notes: data.notes || '',
    language: data.language || '',
  };
}

export async function extractFromPhotos(files) {
  const parts = [];
  for (const f of files) parts.push(await toPart(await shrinkPhoto(f), 'image/jpeg'));
  return run(parts,
    'Attached are photo(s) of a recipe — a handwritten card, a cookbook page, a clipping. ' +
    'Read them (they may be pages/sides of the SAME recipe) and turn them into one card.');
}

export async function extractFromVoice(blob) {
  const mimeType = (blob.type || 'audio/webm').split(';')[0];
  const part = await toPart(blob, mimeType);
  return run([part],
    'Attached is a recording of someone saying a recipe out loud, in whatever language they speak. ' +
    'Transcribe it faithfully first, then structure it into one card. ' +
    'Spoken asides that are not ingredients or steps belong in "notes".');
}

// ── Errors, translated to human ────────────────────────────────────────────

function friendly(e) {
  const msg = String(e?.message || e);
  if (/not enabled|has not been used|SERVICE_DISABLED|PERMISSION_DENIED|403/i.test(msg)) {
    return 'AI import isn’t switched on for this project yet. In the Firebase console, open "AI Logic" and enable the Gemini Developer API — then try again.';
  }
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(msg)) {
    return 'The AI is over its limit right now. Give it a minute and try again.';
  }
  if (/network|fetch|Failed to fetch|offline/i.test(msg)) {
    return 'Couldn’t reach the AI — check your connection and try again.';
  }
  console.warn('[ai] extract failed:', e);
  return 'The AI couldn’t read that one. Try again, or with clearer photos.';
}
