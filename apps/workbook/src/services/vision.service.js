// Read a workbook page photo and return its text as structured, reading-order
// blocks so we can rebuild it on screen with every word tappable.
//
// Uses Firebase AI Logic (Gemini) exactly like apps/collector and
// apps/recipebox: NO API key ships to the client — access is gated by the
// Firebase project. Enable it once in the Firebase console → "AI Logic" →
// Gemini Developer API for the josh-cocciardi project.

const shrinkPhoto = async (file, maxEdge = 2000) => {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
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
    fr.onerror = () => reject(new Error('Could not read the image.'));
    fr.readAsDataURL(blob);
  });

const getModel = async (responseSchema) => {
  const { getApp } = await import('firebase/app');
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai');
  const ai = getAI(getApp(), { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.1 },
  });
};

// Read the page → { title, blocks: [{ kind, number, text }] }.
export const readWorkbookPage = async (file) => {
  const { Schema } = await import('firebase/ai');
  const schema = Schema.object({
    properties: {
      title: Schema.string(),
      blocks: Schema.array({
        items: Schema.object({
          properties: {
            kind: Schema.string(), // heading | direction | question | passage | example | choice | other
            number: Schema.string(), // "1", "2a", "" — the printed label if any
            text: Schema.string(),
          },
        }),
      }),
    },
  });

  const model = await getModel(schema);
  const shrunk = await shrinkPhoto(file);
  const part = { inlineData: { data: await blobToBase64(shrunk), mimeType: 'image/jpeg' } };

  const intro =
    'You are transcribing a page from a young child\'s school workbook so it can ' +
    'be rebuilt on screen and read aloud to a child who is just learning to read. ' +
    'Transcribe the TEXT on the page EXACTLY as printed, in natural reading order.\n\n' +
    'Break it into "blocks". For each block set:\n' +
    '- "kind": one of "heading" (a title or section header), "direction" (an ' +
    'instruction telling the child what to do, e.g. "Circle the correct word"), ' +
    '"question" (a numbered problem or question), "passage" (a sentence or story ' +
    'to read), "example" (a worked example), "choice" (an answer option like ' +
    '"A. cat"), or "other".\n' +
    '- "number": the printed label for that item if it has one ("1", "2", "3a"), ' +
    'else an empty string.\n' +
    '- "text": the exact words of that block. Keep the child\'s directions and ' +
    'questions VERBATIM. Do NOT answer or solve anything. Do NOT add commentary, ' +
    'hints, or words that are not on the page. Expand nothing.\n\n' +
    'Ignore purely decorative art, page numbers in the margin, and publisher ' +
    'footers. If the page has a clear title, put it in "title"; otherwise use a ' +
    'short 2–4 word summary of the topic as the title.';

  let result;
  try {
    result = await model.generateContent([{ text: intro }, part]);
  } catch (e) {
    throw new Error(friendlyAIError(e));
  }
  let data;
  try {
    data = JSON.parse(result.response.text());
  } catch {
    throw new Error('The AI could not read that page. Try a clearer, straight-on photo.');
  }

  const blocks = (data.blocks || [])
    .map((b) => ({
      kind: String(b.kind || 'other').toLowerCase(),
      number: String(b.number || '').trim(),
      text: String(b.text || '').trim(),
    }))
    .filter((b) => b.text);

  return { title: String(data.title || '').trim() || 'Workbook page', blocks };
};

// Turn Firebase AI Logic errors into something a grown-up can act on. Mirrors
// apps/collector/src/services/ai.service.js.
export function friendlyAIError(e) {
  const msg = `${e?.message || e} ${e?.code || ''}`;
  if (/app check/i.test(msg)) {
    return 'This project requires App Check, but the app isn’t registered for it. In the Firebase console, register the web app under App Check or turn off enforcement for AI Logic.';
  }
  if (/not.enabled|to be enabled|has not been used|SERVICE_DISABLED|PERMISSION_DENIED|403/i.test(msg)) {
    return 'AI isn’t switched on for this project yet. In the Firebase console open “AI Logic” and enable the Gemini Developer API, then try again.';
  }
  if (/prepayment|credits are depleted|billing/i.test(msg)) {
    return 'The project is out of Gemini credits. Check billing in Google AI Studio, then try again.';
  }
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(msg)) {
    return 'The AI is busy right now. Give it a minute and try again.';
  }
  if (/Failed to fetch|NetworkError|network error|offline|timed? ?out/i.test(msg)) {
    return 'Couldn’t reach the AI — check your connection and try again.';
  }
  console.warn('[vision] request failed:', e);
  return `The AI hit an unexpected error${e?.code ? ` (${e.code})` : ''}. Try again in a minute.`;
}
