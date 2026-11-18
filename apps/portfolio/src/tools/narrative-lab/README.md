# Narrative Lab (`/tools/narrative-lab`)

A private tool that ingests content into a knowledge base and reads it on five
layers (context, reasoning, rhetoric, narrative, invariants), plus what each
derivative did to the source it draws on. It is the software half of the
Narrative Propagation Framework doc. It reports techniques and changes, never
intent.

Private: hidden from the tools index, behind the `/work` Google allowlist
(`src/work/access.js`), and every `nl_*` collection is locked to that account
in `firestore.rules`.

## First run

1. Deploy: `./deploy.sh narrative-lab` (or merge to master; CI deploys
   everything).
2. Open `/tools/narrative-lab`, sign in, go to **Settings**, and save an
   Anthropic API key. If Seasonal Box HQ already has one, it is used until you
   save one here. The key can be written from the browser but never read back.
3. Set the monthly budget. Default $25. Stages stop with a clear message when
   it is reached, and Retry continues once it is raised.
4. **Ingest** a primary source first (a long article or report), then content
   that reacts to it. Use "Derived from" to link them; links inside the text
   are found automatically.

## How an item moves

Submitting writes `nl_items/{id}` with `status: queued, stage: capture`. Each
write fires `nlItemWritten`, which claims the item, runs one stage, and queues
the next. One stage per invocation means each gets the full 9 minutes and a
failure stops at a known stage that Retry resumes.

| Stage | Runs | Does |
| --- | --- | --- |
| capture | code | Fetches the link or takes the pasted text; stores `nl_raw/{id}` once, never edited |
| extract | model | Context packet, atomic claims, upstream references |
| blind | model | Layers 2 and 3 with author and outlet masked (same-length mask, so offsets stay true) |
| resolve | code + model | Sources, derivation edges, narrative filing, claim matching |
| relate | model | One call per stored upstream: transformations, carried and dropped claims, fidelity |
| narrate | model | Layers 4 and 5, invariant pressure, questions |
| writeback | code | Scores, source and narrative profiles, requeues items that were waiting on this one |

Every quote the model returns is located in the original text. A finding
whose quote cannot be found is kept aside and never scored.

## Scores (never combined)

- **Technique density**: weighted Layer 2 and 3 findings per 1,000 words.
  Becomes a 0 to 100 percentile once a genre has 200 scored items.
- **Pressure profile**: 0 to 3 on each invariant, plus direction. A score
  above 1 must cite supporting findings or it is capped at 1.
- **Fidelity**: per derivation edge, claim-level against the source.
- **Source profile**: computed always, shown from 20 items.

The formulas live in `functions/narrative/scoring.js`; the technique library
and transformation catalog in `functions/narrative/library.js` (versioned;
every finding records the version, and **Rescore** reruns an item).

## Cost

Defaults to Claude Opus 5.5 for every stage, with effort set per stage in
Settings. Rough estimate, not yet measured on real traffic: a 2,000-word
article sends about 30,000 input tokens across the five model stages, and
output (including thinking at the blind pass's high effort) dominates the
bill, so expect somewhere around $0.25 to $0.75 per item. Each derivative adds
one comparison call that reads both texts. Spend is recorded per stage on
each item and per month in Settings, so check the first few items and tune
models and effort from there.

## Export

Settings → **Download vault** writes a zip of linked Markdown pages (items,
sources, narratives, claims, an index) with frontmatter and `[[links]]`, for
Obsidian or a knowledge-base repo.

## Sharing

**Sharing** (or **Share…** on a scored item) makes a read-only link at
`/lab/<token>`. The token is 20 random bytes and is the `nl_shares` document
id. A link's scope is one cascade (the default from an item page), one item,
or the whole lab.

- The public page never touches Firestore. It calls `nlPublic`
  (`/api/narrative/share/<token>`, behind a Hosting rewrite), which builds
  the snapshot through the allowlist in `functions/narrative/share.js`.
  Viewers get scores, findings, transformations and excerpts of at most 300
  characters with links to the originals. They never get original texts,
  notes, costs, pipeline steps, claim verdicts or source profiles.
- Turning a link off works on the next load (nothing is cached, `410`).
  Each link counts its views and suggestions.
- Viewers can suggest a link or pasted text on links that take suggestions.
  Suggestions land in `nl_suggestions` and at the top of **Ingest**; nothing
  runs or costs anything until you press Ingest. Each link is limited to 10
  suggestions an hour and the queue to 300 pending, and a hidden honeypot
  field drops simple bots.

## Not built yet

Event pages, the pattern-over-time layer (firehose traits), cascade
clustering, the symmetry benchmark, and a share-sheet entry point. The data
needed for the first three (minute timestamps, link evidence on every edge,
exact claim wording, library versions) is captured from the first item.

## Tests

- `functions/test/narrative-pure.test.mjs`: capture, mask, spans, scores,
  library, schemas. No install. Runs in CI.
- `apps/portfolio/test/narrative-lab.test.mjs`: highlight segments,
  cascades, vault and zip. No install. Runs in CI.
- `functions/test/narrative-pipeline.test.mjs`: the whole pipeline on the
  Firestore emulator with a fake Claude API.
- `apps/portfolio/test/narrative-lab-rules.test.mjs`: the security rules,
  shares and suggestions included.

The pipeline suite also drives `nlPublic`: snapshots, view counts,
suggestions, the hourly limit, the honeypot, and turning a link off.
