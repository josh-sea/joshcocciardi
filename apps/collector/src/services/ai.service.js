// AI ingestion for Collector Shop — the single place that knows which model is
// behind the curtain. Two entry points the UI calls:
//
//   parseBulkItems({ text, audioBlob })  → [{ name, pricePaid, source }]
//   identifyFromPhoto(fileOrBlob)        → { candidates: [ {name, fields…} ] }
//
// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW MODE. AI_ENABLED is false right now, so both functions return canned
// sample results and never call a model. That lets you click through the whole
// flow and give layout feedback before we turn the AI on. When you're happy:
//   1. Flip AI_ENABLED to true.
//   2. Enable "AI Logic" (Gemini Developer API) in the Firebase console for the
//      josh-cocciardi project, and register this web app for App Check if the
//      project enforces it.
// The real Gemini calls below are already written — they mirror what Recipe Box
// does today (apps/recipebox/js/ai.js), using Firebase AI Logic so NO API key
// ships to the client; access is gated by the Firebase project.
// ─────────────────────────────────────────────────────────────────────────────

export const AI_ENABLED = false;

// ── Shared: shrink a photo before sending (model doesn't need 12 MP) ─────────
const shrinkPhoto = async (file, maxEdge = 1600) => {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    return out || file;
  } catch {
    return file;
  }
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(new Error('Could not read the file.'));
    fr.readAsDataURL(blob);
  });

// ── PUBLIC ENTRY POINTS ──────────────────────────────────────────────────────

// Turn a spoken/typed brain-dump into line items. Keep it simple on purpose:
// just the item name and the price if it was mentioned (plus where they got it
// if it slips out). The user reviews and edits the rows before anything saves.
export const parseBulkItems = async ({ text = '', audioBlob = null }) => {
  if (!AI_ENABLED) return mockParseBulk({ text, audioBlob });
  return geminiParseBulk({ text, audioBlob }); // eslint-disable-line no-unreachable
};

// Identify a collectible from a photo and propose field values to autofill.
export const identifyFromPhoto = async (file) => {
  if (!AI_ENABLED) return mockIdentify();
  return geminiIdentify(file); // eslint-disable-line no-unreachable
};

// ── PREVIEW STUBS (canned data; remove once AI_ENABLED) ──────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Light heuristic so typed text does *something* real in preview: split on
// obvious boundaries and pull a dollar amount out of each chunk. The real
// version hands the whole transcript to Gemini, which splits far more reliably.
const mockParseBulk = async ({ text, audioBlob }) => {
  await wait(700); // simulate the round-trip so the loading state is visible
  const raw = (text || '').trim();
  if (!raw) {
    // Voice recordings can't be transcribed in preview — show the shape with
    // the example items so the review screen is reviewable.
    return {
      preview: true,
      note: audioBlob
        ? 'Preview: voice isn’t transcribed until AI is enabled — showing sample rows.'
        : 'Preview: showing sample rows.',
      items: [
        { name: 'Tom Brady rookie card', pricePaid: 38, source: 'Card show' },
        { name: '1998 Fossil 1st Edition Pikachu', pricePaid: 3, source: 'Booster pack' },
      ],
    };
  }
  const chunks = raw
    .split(/\n+|,| and (?:also |then )?|; |\. /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const items = chunks.map((chunk) => {
    const m = chunk.match(/\$?\s?(\d+(?:\.\d{1,2})?)\s*(?:dollars|bucks|usd)?/i);
    const name = chunk
      .replace(/\b(i (?:have|got|paid)|for|that|a|an|the)\b/gi, ' ')
      .replace(/\$?\s?\d+(?:\.\d{1,2})?\s*(?:dollars|bucks|usd)?/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      name: name || chunk,
      pricePaid: m ? Number(m[1]) : null,
      source: '',
    };
  });
  return { preview: true, note: 'Preview: parsed locally with a simple rule — the real version uses Gemini.', items };
};

const mockIdentify = async () => {
  await wait(700);
  return {
    preview: true,
    note: 'Preview: sample matches — the real version reads your photo with Gemini.',
    candidates: [
      {
        label: '2000 Playoff Contenders Tom Brady RC Auto #144',
        name: '2000 Playoff Contenders Tom Brady Rookie Ticket Auto #144',
        category: 'Sports', sport: 'Football', league: 'NFL', itemType: 'Card',
        graded: true, gradingCompany: 'PSA', grade: '9', confidence: 0.82,
      },
      {
        label: '2000 Bowman Tom Brady RC #236',
        name: '2000 Bowman Tom Brady Rookie #236',
        category: 'Sports', sport: 'Football', league: 'NFL', itemType: 'Card',
        graded: false, gradingCompany: '', grade: '', confidence: 0.61,
      },
    ],
  };
};

// ── REAL GEMINI CALLS (dormant until AI_ENABLED=true) ────────────────────────
// Dynamically imported so firebase/ai isn't pulled into the bundle in preview.

const getModel = async (responseSchema) => {
  const { getApp } = await import('firebase/app');
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai');
  const ai = getAI(getApp(), { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.2 },
  });
};

const geminiParseBulk = async ({ text, audioBlob }) => {
  const { Schema } = await import('firebase/ai');
  const schema = Schema.object({
    properties: {
      items: Schema.array({
        items: Schema.object({
          properties: {
            name: Schema.string(),
            pricePaid: Schema.number(),
            hasPrice: Schema.boolean(),
            source: Schema.string(),
          },
        }),
      }),
    },
  });
  const model = await getModel(schema);
  const intro =
    'The user is rattling off collectibles they own. Split what they said into ' +
    'separate line items. For each: "name" is the item as a collector would ' +
    'label it; if they mentioned a price, set "hasPrice" true and "pricePaid" ' +
    'to the number of dollars; otherwise "hasPrice" false. "source" is where ' +
    'they got it if they said so, else empty. Do not invent prices or sources.';
  const parts = [{ text: intro }];
  if (audioBlob) {
    const mimeType = (audioBlob.type || 'audio/webm').split(';')[0];
    parts.push({ inlineData: { data: await blobToBase64(audioBlob), mimeType } });
  } else {
    parts.push({ text: `\nWhat they said:\n${text}` });
  }
  const result = await model.generateContent(parts);
  const data = JSON.parse(result.response.text());
  return {
    items: (data.items || []).map((it) => ({
      name: String(it.name || '').trim(),
      pricePaid: it.hasPrice ? Number(it.pricePaid) : null,
      source: String(it.source || '').trim(),
    })).filter((it) => it.name),
  };
};

const geminiIdentify = async (file) => {
  const { Schema } = await import('firebase/ai');
  const schema = Schema.object({
    properties: {
      candidates: Schema.array({
        items: Schema.object({
          properties: {
            label: Schema.string(),
            name: Schema.string(),
            category: Schema.string(),
            sport: Schema.string(),
            league: Schema.string(),
            itemType: Schema.string(),
            graded: Schema.boolean(),
            gradingCompany: Schema.string(),
            grade: Schema.string(),
            confidence: Schema.number(),
          },
        }),
      }),
    },
  });
  const model = await getModel(schema);
  // Accept a File/Blob or an already-uploaded photo URL. (Fetching a Storage
  // URL cross-origin needs CORS enabled on the bucket; when we turn this on
  // we'll likely identify straight from the File at capture time instead.)
  const blob = typeof file === 'string' ? await (await fetch(file)).blob() : file;
  const shrunk = await shrinkPhoto(blob);
  const part = { inlineData: { data: await blobToBase64(shrunk), mimeType: 'image/jpeg' } };
  const intro =
    'Identify this collectible (sports card, trading card, comic, memorabilia, ' +
    'jersey, etc.) from the photo. Return up to 3 candidates, most likely first, ' +
    'each with a short human "label", a full "name", and the best category, ' +
    'sport, league, itemType, and grading info you can read. "confidence" is 0–1. ' +
    'Only fill fields you are reasonably sure of; leave the rest empty.';
  const result = await model.generateContent([{ text: intro }, part]);
  const data = JSON.parse(result.response.text());
  return { candidates: data.candidates || [] };
};
