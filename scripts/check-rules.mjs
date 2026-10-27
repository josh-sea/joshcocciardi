#!/usr/bin/env node
/* Compile firestore.rules without deploying.
 *
 * Written after a bad merge left a `match` block unclosed and took the whole
 * site's deploy down: hosting, functions and all, not just the rules. The
 * breakage was a single missing brace and there was no way to catch it
 * locally short of deploying.
 *
 * Two things that are NOT a check, both of which I believed at the time:
 *   - counting braces. Path variables like {uid} and {document=**} are
 *     braces too, so the count never balances and the mismatch tells you
 *     nothing.
 *   - `firebase emulators:exec`. The emulator starts perfectly happily on a
 *     rules file that does not compile.
 *
 * The emulator's security-rules REST endpoint is the real compiler, and it
 * returns the same errors the deploy does. That is what this uses.
 *
 *   node scripts/check-rules.mjs [path/to/rules]
 *
 * Needs Java, because the Firestore emulator is a jar. Exits non-zero with
 * the compiler's own message when the rules are bad.
 */

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const file = process.argv[2] || 'firestore.rules';
const PROJECT = 'josh-cocciardi';
const PORT = Number(process.env.RULES_CHECK_PORT || 8080);

const url = `http://127.0.0.1:${PORT}/emulator/v1/projects/${PROJECT}:securityRules`;

async function compile() {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rules: { files: [{ name: file, content: readFileSync(file, 'utf8') }] },
    }),
  });
  const body = await res.text();
  // A clean compile returns 200 with no issues. Anything else is the
  // compiler telling you where it gave up.
  if (res.ok && !/"error"|issues/i.test(body)) return null;
  try { return JSON.parse(body).error.message; } catch { return body.slice(0, 2000); }
}

const alive = async () => {
  try { await fetch(`http://127.0.0.1:${PORT}/`); return true; } catch { return false; }
};

let emulator = null;
if (!(await alive())) {
  emulator = spawn(
    'npx', ['--yes', 'firebase-tools@13', 'emulators:start', '--only', 'firestore', '--project', PROJECT],
    { stdio: 'ignore', detached: true }
  );
  // The jar downloads on first run, so give it a generous window.
  for (let i = 0; i < 90 && !(await alive()); i++) await sleep(2000);
  if (!(await alive())) {
    console.error('Could not start the Firestore emulator. Is Java installed?');
    process.exit(2);
  }
}

const problem = await compile();

if (emulator) { try { process.kill(-emulator.pid); } catch { /* already gone */ } }

if (problem) {
  console.error(`${file} does not compile:\n\n${problem}\n`);
  process.exit(1);
}
console.log(`${file} compiles.`);
