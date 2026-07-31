#!/bin/bash
#
# Builds the mail app and drops the output where the portfolio serves it,
# at /projects/electronic-mail.
#
# Paths are derived from this script's location, so it works from any clone
# (the previous version hardcoded one machine's ~/Downloads).
#
# CI runs the same build on merge to master — see .github/workflows/deploy.yml.
# Use this script for a local build or a manual deploy.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
TARGET="$REPO_ROOT/apps/portfolio/public/projects/electronic-mail"

DEPLOY=0
if [[ "${1:-}" == "--deploy" ]]; then
  DEPLOY=1
fi

echo "Building mail app…"
cd "$APP_DIR"
npm run build

echo "Copying build → $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -r "$APP_DIR/build/." "$TARGET/"

echo "Syncing Firestore indexes to the repo root…"
cp "$APP_DIR/firestore.indexes.json" "$REPO_ROOT/firestore.indexes.json"
echo "  note: firestore.rules at the repo root covers every app on the"
echo "  project and is deliberately NOT overwritten from here — copying the"
echo "  mail-app slice over it would delete every other app's rules."

if [[ "$DEPLOY" -eq 1 ]]; then
  echo "Deploying hosting + Firestore rules…"
  cd "$REPO_ROOT"
  npx firebase-tools@13 deploy --only hosting,firestore:rules
  echo "Live at https://www.joshcocciardi.com/projects/electronic-mail"
else
  echo
  echo "Build staged in the portfolio. Commit it, or re-run with --deploy to"
  echo "push straight to Firebase."
fi
