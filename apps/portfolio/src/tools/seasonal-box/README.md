# Seasonal Box HQ (`/tools/seasonal-box`)

The private admin console for the seasonal home box: ten agents in six orgs
research, source, curate, market, and run operations, and every action with an
outside effect waits for Josh's approval. Built from the spec in
`seasonal-box-plan.md` (MVP sections 4 through 9, admin side).

## Who can see it

- **Unlisted.** The registry entry is `hidden: true`, so it never appears on
  `/tools` or `/projects`. `firebase.json` sends `X-Robots-Tag: noindex` for the
  path and the page adds a matching meta tag.
- **Gated.** The page renders behind `src/work/AuthGate.jsx`: Google sign-in,
  then the address must be in `src/work/access.js`.
- **Enforced server-side.** Every `sbox_*` collection in `firestore.rules`, the
  `sbox/` path in `storage.rules`, and both callables check the same verified
  address. That is the real boundary; the page code is downloadable by anyone
  who knows the URL, the data is not.

To change who has access, edit the list in `src/work/access.js`, the
`sboxAdmin()` function in `firestore.rules`, the `sbox/` block in
`storage.rules`, and `ADMIN_EMAILS` in `functions/seasonalbox/config.js`.

## First-time setup

1. Deploy: merging to master deploys everything (CI runs
   `firebase deploy --only hosting,firestore:rules,storage,functions`). By
   hand: `./deploy.sh seasonal-box`.
2. Open `/tools/seasonal-box` and sign in. The first open seeds settings, the
   ten agents, the room kits, and the three tiers.
3. **Settings → Anthropic API key.** Paste a key and press Save; it is tested
   immediately. The key is write-only: no browser can read it back. Give the
   key a spend limit in the Anthropic console as a backstop to the budgets.
4. **Seasons → New season** with a ship date. The season moves straight to
   Trend Research and starts the Trend Researcher.

## How it works

```
browser (this tool)                Cloud Functions (functions/seasonalbox)
───────────────────                ───────────────────────────────────────
Run now ─► sbox_runs (queued) ──► sboxRunStep: one Claude call per step,
                                   persists the step, bumps `tick`, which
                                   re-fires itself for the next step
                                   │  read-only tools run immediately
                                   │  propose_action ─► sbox_proposals
                                   └─ submit_brief ──► sbox_briefs + approval
Approve / Reject ─► sbox_proposals ──► sboxProposal: executes approved actions
                                   (idempotent), then re-evaluates the season
season edits ────► sbox_seasons ──► sboxSeason: advances stages whose exit
                                   criteria are met, starts the stage's agents
page open ───────► sboxHeartbeat ─► evaluates seasons, queues the Daily
                                   Briefing if the last one is >20h old
```

- **Agents propose, executors act.** An agent's only route to a side effect is
  `propose_action`. Levels come from the agent's autonomy map, clamped by rules
  that live server-side: money never goes green, purchase orders and refunds
  are always red, anything over the dollar threshold is red, and anything that
  would push a season past its operating budget is red.
- **Resumable.** Each step is its own function invocation, persisted before the
  next one starts. A claim on the run (`claim.tick`, `claim.until`) makes a
  duplicate trigger a no-op. A failed run keeps its steps; Resume redoes only
  the step that failed.
- **Honest telemetry.** The ledger, spend counters, step logs, run progress, and
  execution results are written only by the functions; the rules refuse them
  from any browser. "Running" in the UI means a step is actually in flight.
- **Model routing.** Light is Haiku 4.5, standard is Sonnet 5.5, heavy is Opus
  5.5. Research agents call `escalate` to switch to heavy for the synthesis.
  Bulk page reading goes through `summarize_page` on Haiku. Fable is never
  selected. Opus and Sonnet opt into server-side refusal fallbacks, and the
  ledger prices a fallback turn at the model that actually ran.
- **Caching.** The system prompt and taste notes are frozen onto the run at its
  first step and carry cache breakpoints; the conversation uses automatic
  caching and is append-only, so every step after the first reads the prefix
  from cache.
- **Taste notes.** Any decision with a comment, an edit, or a rejection offers
  to save a one-line note scoped to the agent, its org, the season, or
  everyone. Each run records which notes it read (shown on the run page).
- **No cron.** A scheduled function needs Cloud Scheduler enabled, and CI
  deploys every function at once, so an unenabled scheduler would fail the
  whole site's deploy. The heartbeat runs when HQ opens, and every decision
  and season edit re-evaluates its season. See `functions/seasonalbox/index.js`
  for the one-line change once Cloud Scheduler is on.

## What's in this phase, and what isn't

In: the agent runtime (resumable steps, tool registry, proposals and
executors, budgets, ledger, taste notes, model routing, caching), all ten
agents, the 11-stage pipeline with automatic advancement, and the admin app:
Command Center, Seasons (stage tracker, timeline, briefs and versions), Agents
by org (config editor, autonomy dial, Run now, run logs), Makers, Taste notes,
Ledger, and Settings.

Not yet, because each needs an account or decision first:

- **Gmail, Stripe, Shippo/EasyPost, a marketing email service.** Until each is
  connected, approving an email, PO, label batch, or refund puts the approved
  draft in **To do by hand** on the Command Center; mark it done (with what it
  cost) and the ledger records it.
- **The customer storefront and subscriber pages** (spec 8.2 and the
  Subscribers, Orders, and Inbox admin pages): they arrive with Stripe and the
  brand name and domain.
- **Cloud Run browser service.** Agents read pages with Anthropic's web fetch
  for now.
- **Products and inventory page.** Box Plans write season kits; a dedicated
  catalog page comes with receiving.

## Files

| File | What |
|---|---|
| `index.jsx` | Gate, live data, navigation |
| `CommandCenter.jsx` | Inbox, Daily Briefing, seasons, spend, activity |
| `Approvals.jsx` | Approval cards, batch approve, taste-note prompt, manual queue |
| `BriefView.jsx` | Vision board, Scout Report, Box Plan, Daily Briefing, generic |
| `Seasons.jsx` | Season list, creation, stage tracker, brief pages |
| `Agents.jsx` / `RunView.jsx` | Orgs and agents, config editor, run logs |
| `Makers.jsx` / `Admin.jsx` | Makers directory; notes, ledger, settings |
| `seed.js` | Default agents, kits, tiers, settings, timeline |
| `pipeline.js` | Pure date, milestone, and formatting helpers |
| `store.js` | Firestore, callable, and Storage access |

Server side: `functions/seasonalbox/` (`config.js` fixed facts and pricing,
`llm.js` per-model request shape, `tools.js`, `runner.js`, `executors.js`,
`orchestrator.js`, `index.js`).

## Tests

- `apps/portfolio/test/seasonal-box.test.mjs`: pure helpers, seed agent
  consistency, client/server parity. Runs in CI and `deploy.sh`.
- `apps/portfolio/test/seasonal-box-rules.test.mjs`: Firestore rules (emulator).
- `functions/test/seasonalbox-runner.test.mjs`: the runtime end to end against
  the emulators with a fake Claude API (no key, no spend).
