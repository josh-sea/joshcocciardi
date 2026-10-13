# EzPayze

Friendly, escalating payment reminders for small businesses. The owner adds a finished job. Every morning they get a short checklist of reminders about to go out and check off anyone who already paid. Everything else goes out at their send time.

**Core constraint:** EzPayze is a communications layer only. Customers pay the business directly (Venmo, Zelle, Cash App, check, cash, card link). EzPayze never holds, routes, or reconciles customer money. Payment plans are metadata plus reminders. The only money EzPayze handles is its own subscription (Stripe Billing).

Live at **https://ezpayze.web.app** (its own Hosting site in the `josh-cocciardi` project).

## Layout

```
apps/ezpayze/
  functions/                 # Cloud Functions codebase "ezpayze" (TypeScript, Node 22)
    src/shared/              # Pure TS shared with the web app via the @shared alias:
                             #   types, dates, schedule, plan, money, methods,
                             #   templates (reminder wording + renderer), stats, billing
    src/account/             # ensureAccount (profile, 14-day trial, apps.ezpayze claim)
    src/jobs/                # onJobCreate, markPaid/undoMarkPaid, updateJob/cancelJob/editPayment
    src/queue/               # buildDailyQueue, sendQueue, Hold/Approve/Send now
    src/reminders/           # sendReminder (idempotent), sendSample
    src/plans/               # createPlan, pay page + plan requests
    src/analytics/           # onPaymentPaid (facts + summary), nightly rollups
    src/billing/             # Stripe Billing for our subscription only
    src/email, src/sms       # Resend and Twilio over REST (no SDKs)
    src/test/                # unit tests (node:test)
    test-rules/              # security rules suite (emulator)
    test-e2e/                # end-to-end flow suite (emulator)
  web/                       # Vite + React + TS
    src/pages/               # Today, Jobs, JobDetail, AddJob, Dashboard, Settings,
                             # Setup/ (wizard), public/PayPage, Landing, SignIn
```

Rules live in the shared root `firestore.rules` and `storage.rules` (EzPayze sections only).

## Namespacing in the shared project

- **Firestore:** everything under `ezpayze_users/{uid}/...` (customers, jobs, payments, payments/{id}/events, queue/{date}, stats/summary, planRequests). Platform data in `ezpayze_paymentFacts` (anonymized), `ezpayze_config` (keys, settings), `ezpayze_stripeCustomers`. The repo's catch-all rule excludes `ezpayze_.*`.
- **Storage:** `ezpayze/users/{uid}/...`, owner-only, PDFs and images, 10 MB max.
- **Functions:** separate codebase `ezpayze`, all exported under the `ezpayze` group (`ezpayze-markPaid`, `ezpayze-buildDailyQueue`, ...).
- **Auth:** shared user pool; EzPayze users get the custom claim `apps.ezpayze = true`.

No hard-coded project IDs, so moving to a dedicated project later is a config change.

## Local development

```sh
cd apps/ezpayze/functions && npm ci && npm run build
cd ../web && npm ci && cp .env.example .env.local

# from the repo root: emulators (auth, firestore, functions, storage + UI on :4000)
npx firebase-tools emulators:start --config firebase.ezpayze.json --project demo-ezpayze

# in another terminal
cd apps/ezpayze/web && npm run dev
```

On the emulator, with no Resend key, emails are written to `ezpayze_config/devOutbox/emails` instead of being sent, so you can see exactly what would go out. Sign-in links show up in the Auth emulator.

## Tests

```sh
# unit tests (also run in CI)
npm --prefix apps/ezpayze/functions test

# security rules (from the repo root)
npx firebase-tools emulators:exec --config firebase.ezpayze.json --project demo-ezpayze \
  --only firestore,storage "npm --prefix apps/ezpayze/functions run test:rules"

# full end-to-end flow
npx firebase-tools emulators:exec --config firebase.ezpayze.json --project demo-ezpayze \
  --only auth,firestore,functions,storage "npm --prefix apps/ezpayze/functions run test:e2e"
```

## Deploy

Merging to `master` deploys automatically (`.github/workflows/deploy.yml`). EzPayze runs in its own step after the other sites, creates the `ezpayze` Hosting site on first run, and is `continue-on-error`, so it can never block the rest of the monorepo.

By hand: `./deploy.sh ezpayze`, or `firebase deploy --only hosting:ezpayze,functions:ezpayze`.

## One-time setup (Firebase console and providers)

1. **Auth:** enable the **Email link (passwordless)** sign-in method (under Email/Password) and make sure **Google** is enabled. Add `ezpayze.web.app` (and later `ezpayze.com`) to **Authorized domains**.
2. **Email (Resend):** verify the sending domain (`ezpayze.com`, SPF/DKIM/DMARC), then add the key. Reminders come from `"{Business} via EzPayze" <billing@ezpayze.com>` with Reply-To set to the owner.
3. **Keys and settings.** Each key can come from an environment variable / Secret Manager (upper-case name) or from the admin-only Firestore doc `ezpayze_config/secrets` (camelCase field):

   | Env / Secret Manager | `ezpayze_config/secrets` field |
   |---|---|
   | `RESEND_API_KEY` | `resendApiKey` |
   | `STRIPE_SECRET_KEY` | `stripeSecretKey` |
   | `STRIPE_BILLING_WEBHOOK_SECRET` | `stripeBillingWebhookSecret` |
   | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | `twilioAccountSid` / `twilioAuthToken` / `twilioFromNumber` |
   | `PAYPAGE_TOKEN_SECRET` | `paypageTokenSecret` (generated automatically if absent) |

   Optional `ezpayze_config/settings`: `appUrl` (default `https://ezpayze.web.app`), `fromEmail` (default `billing@ezpayze.com`), `stripePriceMonthly`, `stripePriceYearly`, `stripePriceSms`.

   Why the Firestore fallback: a function that binds a Secret Manager secret that doesn't exist yet fails the whole deploy. This keeps deploys green from day one (same pattern as Seasonal Box's `sbox_secrets`). Switching to `defineSecret` later is a small change in `src/lib/config.ts`.
4. **Stripe Billing:** create the Pro monthly ($15), Pro yearly ($150), and Text add-on ($5) prices, put their IDs in `ezpayze_config/settings`, and point a webhook (`customer.subscription.*`) at `https://us-central1-josh-cocciardi.cloudfunctions.net/ezpayze-stripeBillingWebhook`.
5. **Custom domain:** Hosting → `ezpayze` site → Add custom domain (`ezpayze.com`, or `ezpayze.camboindustries.com` for beta), then update `appUrl`.

Until step 2 is done the app works fully (sign-in, setup, jobs, the morning list, Got paid, plans, numbers), but sends fail with "Email sending is not set up yet" and stay on the list to try again the next day.

## How sending works

- `onJobCreate` turns a job into a payment with `nextReminderDue` (a local `YYYY-MM-DD`). Default ladder: 7, 14, 30 days late (friendly, firmer, final). Plan installments get a heads-up 3 days before each due date.
- Every 15 minutes `buildDailyQueue` builds `queue/{today}` for owners whose local `morningTime` has passed, and emails them the list. `sendQueue` sends what is left at their local `sendTime` (`auto`: everything not checked off; `approve`: only what they approved).
- `sendReminder` claims `events/send_{stage}` in a transaction (re-checking the payment is still unpaid and on that stage) before sending, and passes an idempotency key to Resend. Paid, paused, held, or already-sent payments are never sent.
- A job added long after its due date never gets reminders on back-to-back days (minimum 3 days between).

## Plan limits (enforced in Functions)

Free: 3 open jobs with reminders on (more can be saved; their reminders stay paused), email only. Pro: unlimited jobs, attachments sent with reminders, payment plans, numbers page, custom wording. Text add-on: SMS, capped at 300/month. New accounts get 14 days of Pro, no card.

## Notes vs. the build handoff

- Firestore uses `ezpayze_*` prefixed top-level collections (the repo's convention) rather than an `apps/ezpayze/...` path or a named database.
- Reminder rendering lives in `src/shared/templates.ts` (shared with the web preview) instead of `email/renderPayment.ts` + `email/templates/*`.
- Phase 2 items (email forwarding, Stripe Payment Link webhook) are not built.
