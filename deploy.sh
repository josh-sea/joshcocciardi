#!/bin/bash
# Unified deploy script for joshcocciardi monorepo
#
# Usage:
#   ./deploy.sh all          - Build all apps and deploy hosting + firestore
#   ./deploy.sh portfolio    - Build portfolio only, deploy hosting
#   ./deploy.sh email        - Build email app, copy to portfolio, deploy hosting
#   ./deploy.sh moments      - Build moment-capture, copy to portfolio, deploy hosting
#   ./deploy.sh collector    - Build collector shop, copy to portfolio, deploy hosting
#   ./deploy.sh workbook     - Build workbook reader, deploy hosting + rules + TTS function
#   ./deploy.sh playball     - Copy playball (no build), copy to portfolio, deploy hosting
#   ./deploy.sh canitwo      - Copy canitwo (no build), copy to portfolio, deploy hosting
#   ./deploy.sh recipebox    - Copy recipebox (no build), copy to portfolio, deploy hosting
#   ./deploy.sh psx          - Copy psx station (no build), deploy hosting + rules
#   ./deploy.sh solra        - Run the Solra tests, copy (no build), deploy hosting
#   ./deploy.sh gatekeeper   - Deploy Gatekeeper parent app + functions + firestore (igatekeeper.web.app)
#   ./deploy.sh firestore    - Deploy firestore rules + indexes only
#   ./deploy.sh storage      - Deploy storage rules only
#
# Apps live in:
#   apps/portfolio/   - Main React portfolio SPA (CRA)
#   apps/email/       - Gmail reader app (CRA) → served at /projects/electronic-mail
#   apps/moment-capture/ - Moment capture app (Vite) → served at /projects/moments
#   apps/collector/   - Collector Shop inventory app (Vite) → served at /projects/collector
#   apps/workbook/    - Workbook Reader accessibility app (Vite) → served at /projects/workbook
#   apps/playball/    - Playball walk-up music app (static) → served at /projects/playball
#   apps/canitwo/     - CanITwo bathroom finder (static) → served at /projects/canitwo
#   apps/recipebox/   - Gram & Pop's Recipe Box (static) → gramandpops.com,
#                       mirrored at /projects/recipebox
#   apps/psx/         - PSX Station browser emulator (static) → served at /projects/psx
#   apps/solra/       - Solra Trainer language practice tool (static) → served at /projects/solra
#
# Hosting is multi-site: the "portfolio" target deploys apps/portfolio/build/
# (all sub-apps are built into apps/portfolio/public/ before portfolio builds),
# and the "gramandpops" target deploys apps/recipebox/ directly at the root
# of gramandpops.com. `firebase deploy --only hosting` pushes both.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTFOLIO_DIR="$ROOT_DIR/apps/portfolio"
EMAIL_DIR="$ROOT_DIR/apps/email"
MOMENTS_DIR="$ROOT_DIR/apps/moment-capture"
COLLECTOR_DIR="$ROOT_DIR/apps/collector"
PLAYBALL_DIR="$ROOT_DIR/apps/playball"
CANITWO_DIR="$ROOT_DIR/apps/canitwo"
RECIPEBOX_DIR="$ROOT_DIR/apps/recipebox"
PSX_DIR="$ROOT_DIR/apps/psx"
SOLRA_DIR="$ROOT_DIR/apps/solra"
WORKBOOK_DIR="$ROOT_DIR/apps/workbook"
GATEKEEPER_DIR="$ROOT_DIR/apps/gatekeeper/app"

log() { echo ""; echo "==> $1"; }
success() { echo "✅ $1"; }
warn() { echo "⚠️  $1"; }
fail() { echo "❌ $1"; exit 1; }

build_email() {
    log "Building email app..."
    cd "$EMAIL_DIR"
    npm run build || fail "Email app build failed"
    success "Email app built"

    log "Copying email app to portfolio/public/projects/electronic-mail..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/electronic-mail"
    rm -rf "$PORTFOLIO_DIR/public/projects/electronic-mail"/*
    cp -r "$EMAIL_DIR/build"/* "$PORTFOLIO_DIR/public/projects/electronic-mail/"
    success "Email app copied"
}

build_moments() {
    log "Building moment-capture app..."
    cd "$MOMENTS_DIR"
    npm run build || fail "moment-capture build failed"
    success "moment-capture built"

    log "Copying moment-capture to portfolio/public/projects/moments..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/moments"
    rm -rf "$PORTFOLIO_DIR/public/projects/moments"/*
    cp -r "$MOMENTS_DIR/dist"/* "$PORTFOLIO_DIR/public/projects/moments/"
    success "moment-capture copied"
}

build_collector() {
    log "Building collector shop app..."
    cd "$COLLECTOR_DIR"
    npm run build || fail "collector build failed"
    success "collector built"

    log "Copying collector to portfolio/public/projects/collector..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/collector"
    rm -rf "$PORTFOLIO_DIR/public/projects/collector"/*
    cp -r "$COLLECTOR_DIR/dist"/* "$PORTFOLIO_DIR/public/projects/collector/"
    success "collector copied"
}

build_workbook() {
    log "Building workbook reader app..."
    cd "$WORKBOOK_DIR"
    npm run build || fail "workbook build failed"
    success "workbook built"

    log "Copying workbook to portfolio/public/projects/workbook..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/workbook"
    rm -rf "$PORTFOLIO_DIR/public/projects/workbook"/*
    cp -r "$WORKBOOK_DIR/dist"/* "$PORTFOLIO_DIR/public/projects/workbook/"
    success "workbook copied"
}

build_playball() {
    log "Copying playball to portfolio/public/projects/playball (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/playball"
    rm -rf "$PORTFOLIO_DIR/public/projects/playball"/*
    cp -r "$PLAYBALL_DIR"/* "$PORTFOLIO_DIR/public/projects/playball/"
    rm -f "$PORTFOLIO_DIR/public/projects/playball/README.md"
    success "playball copied"
}

build_canitwo() {
    log "Copying canitwo to portfolio/public/projects/canitwo (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/canitwo"
    rm -rf "$PORTFOLIO_DIR/public/projects/canitwo"/*
    cp -r "$CANITWO_DIR"/* "$PORTFOLIO_DIR/public/projects/canitwo/"
    rm -f "$PORTFOLIO_DIR/public/projects/canitwo/README.md"
    success "canitwo copied"
}

build_recipebox() {
    log "Copying recipebox to portfolio/public/projects/recipebox (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/recipebox"
    rm -rf "$PORTFOLIO_DIR/public/projects/recipebox"/*
    cp -r "$RECIPEBOX_DIR"/* "$PORTFOLIO_DIR/public/projects/recipebox/"
    rm -f "$PORTFOLIO_DIR/public/projects/recipebox/README.md"
    success "recipebox copied"
}

build_psx() {
    log "Copying psx station to portfolio/public/projects/psx (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/psx"
    rm -rf "$PORTFOLIO_DIR/public/projects/psx"/*
    cp -r "$PSX_DIR"/* "$PORTFOLIO_DIR/public/projects/psx/"
    rm -f "$PORTFOLIO_DIR/public/projects/psx/README.md"
    success "psx station copied"
}

build_solra() {
    # No build step, but the language modules carry a dependency-free test
    # suite that renders and decodes every word. Cheap, so always run it.
    log "Testing Solra..."
    cd "$SOLRA_DIR"
    node test/roundtrip.mjs || fail "Solra round-trip tests failed"

    log "Copying solra to portfolio/public/projects/solra (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/solra"
    rm -rf "$PORTFOLIO_DIR/public/projects/solra"/*
    cp -r "$SOLRA_DIR"/* "$PORTFOLIO_DIR/public/projects/solra/"
    rm -rf "$PORTFOLIO_DIR/public/projects/solra/test"
    rm -f "$PORTFOLIO_DIR/public/projects/solra/README.md" \
          "$PORTFOLIO_DIR/public/projects/solra/package.json"
    success "solra copied"
}

build_portfolio() {
    log "Building portfolio..."
    cd "$PORTFOLIO_DIR"
    npm run build || fail "Portfolio build failed"
    success "Portfolio built → apps/portfolio/build/"
}

deploy_hosting() {
    log "Deploying to Firebase Hosting..."
    cd "$ROOT_DIR"
    firebase deploy --only hosting || fail "Firebase hosting deploy failed"
    success "Hosting deployed"
    echo ""
    echo "Live URLs:"
    echo "  Portfolio:      https://www.joshcocciardi.com"
    echo "  Gram & Pop's:   https://gramandpops.com  (Recipe Box at the root)"
    echo "  Email:          https://www.joshcocciardi.com/projects/electronic-mail"
    echo "  Moments:        https://www.joshcocciardi.com/projects/moments"
    echo "  Collector Shop: https://www.joshcocciardi.com/projects/collector"
    echo "  Workbook:       https://www.joshcocciardi.com/projects/workbook"
    echo "  Playball:       https://www.joshcocciardi.com/projects/playball"
    echo "  CanITwo:        https://www.joshcocciardi.com/projects/canitwo"
    echo "  Recipe Box:     https://www.joshcocciardi.com/projects/recipebox"
    echo "  PSX Station:    https://www.joshcocciardi.com/projects/psx"
    echo "  Solra Trainer:  https://www.joshcocciardi.com/projects/solra"
    echo "  Dead Net:       https://www.joshcocciardi.com/projects/deadnet"
    echo "  Tools:          https://www.joshcocciardi.com/tools"
}

deploy_gatekeeper() {
    log "Deploying Gatekeeper (parent app hosting + functions + firestore)..."
    cd "$ROOT_DIR"
    # Static app served directly from apps/gatekeeper/app (no build step), plus
    # the extension-facing API, push trigger, and the rules/indexes it needs.
    firebase deploy --only \
      hosting:igatekeeper,functions:gatekeeperApi,functions:gatekeeperOnRequest,firestore:rules,firestore:indexes \
      || fail "Gatekeeper deploy failed"
    success "Gatekeeper deployed"
    echo ""
    echo "  Parent console:  https://igatekeeper.web.app"
    echo "  Extension API:   https://us-central1-josh-cocciardi.cloudfunctions.net/gatekeeperApi"
}

deploy_workbook_function() {
    log "Deploying Workbook TTS function (synthesizeWord)..."
    cd "$ROOT_DIR"
    # Needs the Cloud Text-to-Speech API enabled on the josh-cocciardi project.
    firebase deploy --only functions:synthesizeWord || warn "synthesizeWord deploy failed (is the Text-to-Speech API enabled?)"
    success "synthesizeWord deployed"
}

deploy_firestore() {
    log "Deploying Firestore rules and indexes..."
    cd "$ROOT_DIR"
    firebase deploy --only firestore:rules,firestore:indexes || warn "Firestore deploy failed"
    success "Firestore deployed"
}

deploy_storage() {
    log "Deploying Storage rules..."
    cd "$ROOT_DIR"
    firebase deploy --only storage || warn "Storage deploy failed"
    success "Storage rules deployed"
}

case "${1:-all}" in
    all)
        echo "========================================"
        echo "  Deploying all apps"
        echo "========================================"
        build_email
        build_moments
        build_collector
        build_playball
        build_canitwo
        build_recipebox
        build_psx
        build_solra
        build_workbook
        build_portfolio
        deploy_firestore
        deploy_hosting
        ;;
    portfolio)
        echo "========================================"
        echo "  Deploying portfolio only"
        echo "========================================"
        build_portfolio
        deploy_hosting
        ;;
    email)
        echo "========================================"
        echo "  Deploying email app"
        echo "========================================"
        build_email
        build_portfolio
        deploy_hosting
        ;;
    moments)
        echo "========================================"
        echo "  Deploying moment-capture"
        echo "========================================"
        build_moments
        build_portfolio
        deploy_hosting
        ;;
    collector)
        echo "========================================"
        echo "  Deploying collector shop"
        echo "========================================"
        build_collector
        build_portfolio
        deploy_firestore
        deploy_hosting
        ;;
    playball)
        echo "========================================"
        echo "  Deploying playball"
        echo "========================================"
        build_playball
        build_portfolio
        deploy_hosting
        ;;
    canitwo)
        echo "========================================"
        echo "  Deploying canitwo"
        echo "========================================"
        build_canitwo
        build_portfolio
        deploy_hosting
        ;;
    recipebox)
        echo "========================================"
        echo "  Deploying recipebox"
        echo "========================================"
        build_recipebox
        build_portfolio
        deploy_hosting
        ;;
    psx)
        echo "========================================"
        echo "  Deploying PSX Station"
        echo "========================================"
        build_psx
        build_portfolio
        deploy_firestore
        deploy_storage
        deploy_hosting
        ;;
    solra)
        echo "========================================"
        echo "  Deploying Solra Trainer"
        echo "========================================"
        build_solra
        build_portfolio
        deploy_hosting
        ;;
    workbook)
        echo "========================================"
        echo "  Deploying workbook reader"
        echo "========================================"
        build_workbook
        build_portfolio
        deploy_firestore
        deploy_storage
        deploy_workbook_function
        deploy_hosting
        ;;
    gatekeeper)
        echo "========================================"
        echo "  Deploying Gatekeeper (igatekeeper.web.app)"
        echo "========================================"
        deploy_gatekeeper
        ;;
    firestore)
        echo "========================================"
        echo "  Deploying Firestore only"
        echo "========================================"
        deploy_firestore
        ;;
    storage)
        echo "========================================"
        echo "  Deploying Storage rules only"
        echo "========================================"
        deploy_storage
        ;;
    *)
        echo "Unknown command: $1"
        echo "Usage: ./deploy.sh [all|portfolio|email|moments|collector|workbook|playball|canitwo|recipebox|psx|solra|gatekeeper|firestore|storage]"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "  Done!"
echo "========================================"
