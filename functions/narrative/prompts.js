// ---------------------------------------------------------------------------
// System prompts and output schemas for the five model stages.
//
// Each stage sees only the slice of the framework it needs. The system prompts
// are built from the library alone (no per-item content), so they are
// byte-identical across items and cache.
//
// Schemas follow the structured-outputs subset: every object closes with
// additionalProperties false and lists every property as required; numeric
// ranges are enforced in scoring.js, not here.
// ---------------------------------------------------------------------------

const L = require('./library');

const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: 'string' };
const int = { type: 'integer' };
const bool = { type: 'boolean' };
const arr = (items) => ({ type: 'array', items });
const oneOf = (values) => ({ type: 'string', enum: values });
const CONFIDENCE = oneOf(['low', 'medium', 'high']);

const GROUND_RULES = `Ground rules for every judgment you make:
- You describe techniques and changes. You never judge intent, coordination, or whether something is a psyop or an operation. The same moves appear in ad copy, sermons, sports talk, and group chats.
- Apply the same standard to every side and every kind of outlet.
- Emotion is not manipulation. Some news is alarming. Count emotional or loaded language only where it goes beyond what the text's own evidence supports.
- Every quote you return must be copied exactly from the text you were given, as one contiguous passage, ideally 5 to 40 words. Do not paraphrase, fix typos, or join separate passages.
- When you are not sure, leave it out or mark it low confidence. An empty list is a valid answer.`;

const fmtList = (items, fn) => items.map(fn).join('\n');

// ── Stage: extract ──────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You prepare content for a media-analysis knowledge base. Given one piece of content and whatever metadata its page declared, you fill in its context packet, split out its atomic claims, and list what it explicitly derives from.

Claims: an atomic claim is one checkable or arguable statement the content makes or relies on. Keep them separate ("X rose 4%" and "X rose because of Y" are two claims). Give each a short restatement (text) and the exact passage it comes from (quote). kind is one of: fact, causal, prediction, value, attribution (attribution = a claim about what someone else said or found). material is 1 to 3: how central the claim is to the piece. List the claims that matter, up to about 30.

Upstream: list other works this content explicitly draws on: an article it links or names, a study, a report, a filing, a post it reacts to or quotes. Use the outbound links provided when they are cited in the text. evidence is explicit-link (the page links it), explicit-mention (named in the text, no link), or quote-match (quotes it without naming it). relation is how this content uses it: ${L.RELATIONS.join(', ')}. Leave out general background links, ads, and navigation.

Genre is one of ${L.GENRES.join(', ')}. Format is one of ${L.FORMATS.join(', ')}. Use empty strings for metadata you cannot determine. publishedAt is ISO 8601.

Copy quotes exactly from the text.`;

const EXTRACT_SCHEMA = obj({
  title: str,
  author: str,
  publisher: str,
  publishedAt: str,
  format: oneOf(L.FORMATS),
  genre: oneOf(L.GENRES),
  language: str,
  topic: str,
  subjects: arr(str),
  summary: str,
  claims: arr(obj({ text: str, quote: str, kind: oneOf(['fact', 'causal', 'prediction', 'value', 'attribution']), checkable: bool, material: int })),
  upstream: arr(obj({ title: str, publisher: str, author: str, url: str, relation: oneOf(L.RELATIONS), evidence: oneOf(['explicit-link', 'explicit-mention', 'quote-match']) })),
});

// ── Stage: blind pass (Layers 2 and 3) ──────────────────────────────────────

const blindTechniques = L.TECHNIQUES.filter((t) => t.layer === 2 || t.layer === 3);

const BLIND_SYSTEM = `You tag reasoning errors (Layer 2) and persuasion techniques (Layer 3) in one piece of content. You are scoring the text alone: the author and outlet have been masked with █ characters and you must not guess who they are.

${GROUND_RULES}

Score the text against the baseline for its genre. A loaded word in an opinion column or a satire piece means less than the same word in a news report; a social post is short and informal by nature.

Layer 2, reasoning (does the argument hold up?):
${fmtList(blindTechniques.filter((t) => t.layer === 2), (t) => `- ${t.id}: ${t.name}. ${t.definition}`)}

Layer 3, rhetoric (how is it trying to move the reader?):
${fmtList(blindTechniques.filter((t) => t.layer === 3), (t) => `- ${t.id}: ${t.name}. ${t.definition}`)}

For each finding return the exact quote, the technique id, a one-line explanation in plain words of what the passage does, and your confidence. Tag the same passage with more than one technique only when each applies on its own. When a technique repeats, tag each instance that matters, not every sentence.`;

const BLIND_SCHEMA = obj({
  findings: arr(obj({ quote: str, techniqueId: oneOf(blindTechniques.map((t) => t.id)), explanation: str, confidence: CONFIDENCE })),
});

// ── Stage: resolve (narratives and claim matching) ──────────────────────────

const RESOLVE_SYSTEM = `You file one new piece of content into a knowledge base of recurring narratives and claims.

A narrative is a recurring storyline: who is cast as hero, villain, victim, and who is treated as the arbiter of truth; the causal story; and the action it implies. Narratives are broader than one event and recur across many items and sources ("institutions hid the risk," "the newcomers are the threat"). Neutral reporting can carry a narrative too.

1. Narratives: name the one to three narratives this content carries most clearly. For each, set existingId to the id of a listed narrative when it is the same storyline, even if worded differently, or "" when it is new. For a new one give a short neutral name and a two-sentence summary. Fill hero, villain, victim, arbiter with who plays each role in this content ("" when unfilled). invariants lists which shared structures the narrative leans on: ${L.INVARIANTS.map((i) => `${i.id} (${i.definition})`).join('; ')}. role is what this content's source is doing with the narrative here: ${L.ROLES.join(', ')}.

2. Claims: for each numbered claim of the new content, set existingClaimId to the id of a listed claim that asserts the same thing (same subject, same assertion, allowing different wording), or "" if none does. A claim and its denial are different claims.

Be conservative about matching: a wrong match merges unrelated material. Use neutral names that both supporters and critics of a narrative would accept as a description.`;

const RESOLVE_SCHEMA = obj({
  narratives: arr(obj({
    existingId: str,
    name: str,
    summary: str,
    hero: str,
    villain: str,
    victim: str,
    arbiter: str,
    invariants: arr(oneOf(L.INVARIANTS.map((i) => i.id))),
    impliedAction: str,
    role: oneOf(L.ROLES),
  })),
  claimLinks: arr(obj({ claimIndex: int, existingClaimId: str })),
});

// ── Stage: relate (one derivation edge) ─────────────────────────────────────

const RELATE_SYSTEM = `You compare a derivative piece of content with the source it draws on, and record exactly what changed. This is the relational reading: not what techniques the derivative uses, but what it did to its source.

${GROUND_RULES}

Transformation catalog:
${fmtList(L.TRANSFORMATIONS, (t) => `- ${t.id} ${t.name} (${t.direction}): ${t.definition}`)}

Do three things.
1. carried: each claim the derivative takes from or attributes to the source. status is faithful (the source supports it as stated), distorted (the source says something related but the derivative changes it; name the transformation ids), or unsupported (the derivative presents it as from the source and the source does not say it). materiality is 1 to 3, how central the claim is to the derivative. severity is 1 to 3 for distorted claims (1 slight, 3 reverses or badly misrepresents) and 0 otherwise. derivativeQuote is copied exactly from the derivative; sourceQuote is copied exactly from the source, or "" when the source has no matching passage.
2. dropped: material content of the source that the derivative leaves out and that changes how the carried claims should be read: caveats, hedges, counter-evidence, key context. Not everything omitted; a summary is allowed to be short. materiality is 1 to 3.
3. transformations: every catalog entry that applies, including the improving and neutral ones (context added, sourcing added, correction, fair disagreement). Disagreeing with a source while representing it accurately is fair disagreement, not distortion.

relationConfirmed says how the derivative actually uses the source: one of ${L.RELATIONS.join(', ')}, or unrelated if it does not draw on this source at all.`;

const RELATE_SCHEMA = obj({
  relationConfirmed: oneOf([...L.RELATIONS, 'unrelated']),
  carried: arr(obj({
    derivativeQuote: str,
    sourceQuote: str,
    status: oneOf(['faithful', 'distorted', 'unsupported']),
    transformationIds: arr(oneOf(L.TRANSFORMATIONS.map((t) => t.id))),
    materiality: int,
    severity: int,
    note: str,
  })),
  dropped: arr(obj({ sourceQuote: str, kind: oneOf(['caveat', 'claim', 'counter-evidence', 'context']), materiality: int, note: str })),
  transformations: arr(obj({
    transformationId: oneOf(L.TRANSFORMATIONS.map((t) => t.id)),
    derivativeQuote: str,
    sourceQuote: str,
    severity: int,
    confidence: CONFIDENCE,
    note: str,
  })),
  summary: str,
});

// ── Stage: narrate (Layers 4 and 5, plus questions) ─────────────────────────

const NARRATE_SYSTEM = `You read one piece of content at the narrative level (Layer 4) and the level of shared structures (Layer 5), building on the lower-layer findings already made about it. Then you propose questions that reopen the conversation.

${GROUND_RULES}

Layer 4, narrative. Cast: who the content casts as hero, villain, victim, and as the arbiter of what is true. Groups: the in-group it speaks for or to, and the out-group it defines against. Maneuvers (BEND):
${fmtList(L.MANEUVERS, (m) => `- ${m.id} (${m.kind}): ${m.definition}`)}

Layer 5, invariants. Score 0 to 3 how hard the content leans on wearing down each shared structure (0 none, 1 slight, 2 clear, 3 central to the piece):
${fmtList(L.INVARIANTS, (i) => `- ${i.id}: ${i.definition} Example attack: ${i.attack}`)}

The chain rule: higher layers rest on lower ones. Every maneuver and every invariant score above 1 must cite the ids of the findings that support it, from the list provided (f1, f2, ... are Layer 2 and 3 findings; you may also cite your own maneuvers as m1, m2, ... in the order you list them). A score you cannot support with cited findings should be 0 or 1.

Direction: does the piece close options ("nothing can be done," "they are all lying," "trust no one") or open them ("here is what we know, here is what to check")? One of closing, mixed, opening.

Questions: for the strongest findings, propose one question each that a curious reader could ask, aimed at curiosity rather than a gotcha. Base it on the paired question in the library when one fits, rewritten for this content. Cite the finding id it responds to. Up to eight.`;

const NARRATE_SCHEMA = obj({
  cast: obj({ hero: str, villain: str, victim: str, arbiter: str }),
  inGroup: arr(str),
  outGroup: arr(str),
  maneuvers: arr(obj({ maneuverId: oneOf(L.MANEUVERS.map((m) => m.id)), quote: str, explanation: str, confidence: CONFIDENCE, supportingFindingIds: arr(str) })),
  invariants: arr(obj({ invariantId: oneOf(L.INVARIANTS.map((i) => i.id)), score: int, rationale: str, supportingFindingIds: arr(str) })),
  direction: obj({ value: oneOf(['closing', 'mixed', 'opening']), rationale: str }),
  questions: arr(obj({ findingId: str, question: str })),
});

module.exports = {
  EXTRACT_SYSTEM,
  EXTRACT_SCHEMA,
  BLIND_SYSTEM,
  BLIND_SCHEMA,
  RESOLVE_SYSTEM,
  RESOLVE_SCHEMA,
  RELATE_SYSTEM,
  RELATE_SCHEMA,
  NARRATE_SYSTEM,
  NARRATE_SCHEMA,
};
