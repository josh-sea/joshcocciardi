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
#   ./deploy.sh disney       - Run the game tests, copy (no build), deploy hosting + rules
#   ./deploy.sh gatekeeper   - Deploy Gatekeeper parent app + functions + firestore (igatekeeper.web.app)
#   ./deploy.sh myreadingbuddy - Build portfolio, deploy hosting, firestore + storage rules, file function
#   ./deploy.sh mise         - Build portfolio, deploy hosting + firestore and storage rules
#   ./deploy.sh seasonal-box - Build portfolio, deploy rules + the sbox* agent functions + hosting
#   ./deploy.sh firestore    - Deploy firestore rules + indexes only
#   ./deploy.sh storage      - Deploy storage rules only
#   ./deploy.sh ezpayze      - Test + build EzPayze, deploy its hosting site, functions, and rules
#   ./deploy.sh tophat       - Test Tophat & Spears, copy (no build), deploy hosting + Realtime Database rules
#   ./deploy.sh party        - Test Party Room, copy (no build), deploy hosting + Realtime Database rules
#   ./deploy.sh roy          - Export the Roy web build, deploy its hosting site, functions, and Realtime Database rules
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
#   apps/disney-trivia/ - Ticket Book trivia + Where Am I photo decks (static)
#                       → served at /projects/disney-trivia
#   apps/tophat-spears/ - Tophat & Spears multiplayer RTS/FPS (static, Realtime Database)
#                       → served at /projects/tophat-spears
#   apps/party-room/    - Party Room: Forehead, Trivia, Quick Sketch, Chips & Dip, Word Race
#                       (static, Realtime Database) → served at /projects/party-room
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
DISNEY_DIR="$ROOT_DIR/apps/disney-trivia"
TOPHAT_DIR="$ROOT_DIR/apps/tophat-spears"
PARTY_DIR="$ROOT_DIR/apps/party-room"
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

build_disney() {
    # No build step, but the game rules carry a dependency-free suite that
    # proves the peephole can never open past its ceiling. Cheap, so always
    # run it. The security rules have their own emulator suite, run by hand:
    # see functions/test/README.md.
    log "Testing the Disney games..."
    cd "$ROOT_DIR"
    node apps/portfolio/test/whereami.test.mjs || fail "Where Am I tests failed"
    node apps/portfolio/test/park.test.mjs || fail "Park Planner tests failed"
    node apps/portfolio/test/curve.test.mjs || fail "Wait curve tests failed"
    node apps/portfolio/test/scale.test.mjs || fail "1 to 10 tests failed"
    node apps/portfolio/test/room.test.mjs || fail "1 to 10 room tests failed"

    log "Copying disney-trivia to portfolio/public/projects/disney-trivia (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/disney-trivia"
    rm -rf "$PORTFOLIO_DIR/public/projects/disney-trivia"/*
    cp -r "$DISNEY_DIR"/* "$PORTFOLIO_DIR/public/projects/disney-trivia/"
    rm -f "$PORTFOLIO_DIR/public/projects/disney-trivia/README.md"
    success "disney-trivia copied"
}

build_tophat() {
    # No build step. The match rules and lobby seats are pure modules with a
    # dependency-free suite, so always run it.
    log "Testing Tophat & Spears..."
    cd "$ROOT_DIR"
    node apps/portfolio/test/tophat-spears.test.mjs || fail "Tophat & Spears tests failed"

    log "Copying tophat-spears to portfolio/public/projects/tophat-spears (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/tophat-spears"
    rm -rf "$PORTFOLIO_DIR/public/projects/tophat-spears"/*
    cp -r "$TOPHAT_DIR"/* "$PORTFOLIO_DIR/public/projects/tophat-spears/"
    rm -f "$PORTFOLIO_DIR/public/projects/tophat-spears/README.md" \
          "$PORTFOLIO_DIR/public/projects/tophat-spears/package.json" \
          "$PORTFOLIO_DIR/public/projects/tophat-spears/prototype.html"
    success "tophat-spears copied"
}

build_party() {
    # No build step. Every game is a pure state machine with a node suite.
    log "Testing Party Room..."
    cd "$ROOT_DIR"
    node apps/portfolio/test/party-room.test.mjs || fail "Party Room tests failed"

    log "Copying party-room to portfolio/public/projects/party-room (no build step)..."
    mkdir -p "$PORTFOLIO_DIR/public/projects/party-room"
    rm -rf "$PORTFOLIO_DIR/public/projects/party-room"/*
    cp -r "$PARTY_DIR"/* "$PORTFOLIO_DIR/public/projects/party-room/"
    rm -f "$PORTFOLIO_DIR/public/projects/party-room/README.md" \
          "$PORTFOLIO_DIR/public/projects/party-room/package.json"
    rm -rf "$PORTFOLIO_DIR/public/projects/party-room/scripts"
    success "party-room copied"
}

build_portfolio() {
    # Swing Coach ships as a single static page inside public/, with its swing
    # geometry inlined. The suite lifts that engine out of the page and runs
    # synthetic swings through it. Dependency-free, so always run it.
    log "Testing Swing Coach..."
    cd "$PORTFOLIO_DIR"
    node test/swing-coach.test.mjs || fail "Swing Coach tests failed"
    node test/caddy.test.mjs || fail "Golf Caddy tests failed"
    node test/sweat-boy.test.mjs || fail "Sweat Boy tests failed"
    node test/boulder.test.mjs || fail "Boulder Smash cartridge tests failed"
    node test/camboku.test.mjs || fail "Camboku tests failed"

    log "Testing Meal Planner helpers..."
    node test/meal-planner.test.mjs || fail "Meal Planner tests failed"

    log "Testing My Reading Buddy helpers..."
    node test/readingbuddy.test.mjs || fail "My Reading Buddy tests failed"

    log "Testing Seasonal Box helpers..."
    node test/seasonal-box.test.mjs || fail "Seasonal Box tests failed"

    log "Building portfolio..."
    cd "$PORTFOLIO_DIR"
    npm run build || fail "Portfolio build failed"
    success "Portfolio built → apps/portfolio/build/"
}

deploy_hosting() {
    # Rules are compiled server-side during the deploy, so a syntax error
    # there fails hosting and functions with it. Catching it here costs a
    # few seconds and saves a broken deploy. Skipped without Java, since
    # the checker needs the emulator jar.
    if command -v java >/dev/null 2>&1; then
        log "Checking firestore.rules compiles..."
        node "$ROOT_DIR/scripts/check-rules.mjs" || fail "firestore.rules does not compile"
    else
        warn "Java not found; skipping the firestore.rules compile check"
    fi

    log "Deploying to Firebase Hosting..."
    cd "$ROOT_DIR"
    firebase deploy --only hosting:portfolio,hosting:gramandpops,hosting:igatekeeper || fail "Firebase hosting deploy failed"
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
    echo "  Disney games:   https://www.joshcocciardi.com/projects/disney-trivia"
    echo "  Dead Net:       https://www.joshcocciardi.com/projects/deadnet"
    echo "  Disney Trivia:  https://www.joshcocciardi.com/projects/disney-trivia"
    echo "  Swing Coach:    https://www.joshcocciardi.com/projects/swing-coach"
    echo "  Golf Caddy:     https://www.joshcocciardi.com/projects/swing-coach/golf/caddy"
    echo "  Boulder Smash:  https://www.joshcocciardi.com/projects/boulder-smash"
    echo "  Tophat&Spears:  https://www.joshcocciardi.com/projects/tophat-spears"
    echo "  Party Room:     https://www.joshcocciardi.com/projects/party-room  (short link: /party)"
    echo "  Camboy:         https://www.joshcocciardi.com/projects/camboy  (Sweat Boy, Boulder Smash)"
    echo "  Camboku:        https://www.joshcocciardi.com/projects/camboku  (short link: /camboku)"
    echo "  Meal Planner:   https://www.joshcocciardi.com/tools/meal-planner"
    echo "  Reading Buddy:  https://www.joshcocciardi.com/tools/myreadingbuddy"
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

deploy_seasonal_box_functions() {
    log "Deploying Seasonal Box agent runtime (sbox* functions)..."
    cd "$ROOT_DIR"
    firebase deploy --only \
      functions:sboxRunStep,functions:sboxProposal,functions:sboxSeason,functions:sboxHeartbeat,functions:sboxCheckKey \
      || fail "Seasonal Box functions deploy failed"
    success "Seasonal Box functions deployed"
}

deploy_ezpayze() {
    log "Testing and building EzPayze..."
    cd "$ROOT_DIR/apps/ezpayze/functions"
    npm test || fail "EzPayze function tests failed"
    cd "$ROOT_DIR/apps/ezpayze/web"
    npm run build || fail "EzPayze web build failed"
    cd "$ROOT_DIR"
    firebase hosting:sites:get ezpayze >/dev/null 2>&1 || firebase hosting:sites:create ezpayze
    firebase deploy --only hosting:ezpayze,functions:ezpayze,firestore:rules,storage || fail "EzPayze deploy failed"
    success "EzPayze deployed → https://ezpayze.web.app"
}

deploy_roy() {
    log "Building Roy for the web..."
    cd "$ROOT_DIR/apps/roy"
    npm ci || fail "Roy install failed"
    npx expo export -p web --clear || fail "Roy web export failed"
    cd "$ROOT_DIR/apps/roy/functions"
    npm ci || fail "Roy functions install failed"
    cd "$ROOT_DIR"
    firebase hosting:sites:get josh-cocciardi-roy >/dev/null 2>&1 || firebase hosting:sites:create josh-cocciardi-roy
    firebase deploy --only hosting:roy,functions:roy,database || fail "Roy deploy failed"
    success "Roy deployed → https://josh-cocciardi-roy.web.app"
}

deploy_firestore() {
    log "Deploying Firestore rules and indexes..."
    cd "$ROOT_DIR"
    firebase deploy --only firestore:rules,firestore:indexes || warn "Firestore deploy failed"
    success "Firestore deployed"
}

deploy_database() {
    log "Deploying Realtime Database rules..."
    cd "$ROOT_DIR"
    firebase deploy --only database || fail "Realtime Database rules deploy failed"
    success "Realtime Database rules deployed"
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
        build_disney
        build_tophat
        build_party
        build_workbook
        build_portfolio
        deploy_firestore
        deploy_database
        deploy_hosting
        ;;
    ezpayze)
        echo "========================================"
        echo "  Deploying EzPayze"
        echo "========================================"
        deploy_ezpayze
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
    whereami)
        echo "========================================"
        echo "  Deploying Where Am I"
        echo "========================================"
        build_disney
        build_portfolio
        deploy_firestore
        deploy_storage
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
    mise)
        echo "========================================"
        echo "  Deploying Mise"
        echo "========================================"
        build_portfolio
        deploy_firestore
        deploy_storage
        deploy_hosting
        ;;
    myreadingbuddy)
        echo "========================================"
        echo "  Deploying My Reading Buddy"
        echo "========================================"
        build_portfolio
        deploy_firestore
        deploy_storage
        log "Deploying the readingBuddyFile function (video export downloads)..."
        cd "$ROOT_DIR"
        firebase deploy --only functions:readingBuddyFile || fail "readingBuddyFile deploy failed"
        deploy_hosting
        ;;
    seasonal-box)
        echo "========================================"
        echo "  Deploying Seasonal Box HQ"
        echo "========================================"
        build_portfolio
        deploy_firestore
        deploy_storage
        deploy_seasonal_box_functions
        deploy_hosting
        echo "  Seasonal Box:   https://www.joshcocciardi.com/tools/seasonal-box (private)"
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
    roy)
        echo "========================================"
        echo "  Deploying Roy"
        echo "========================================"
        deploy_roy
        ;;
    tophat)
        echo "========================================"
        echo "  Deploying Tophat & Spears"
        echo "========================================"
        build_tophat
        build_portfolio
        deploy_database
        deploy_hosting
        ;;
    party)
        echo "========================================"
        echo "  Deploying Party Room"
        echo "========================================"
        build_party
        build_portfolio
        deploy_database
        deploy_hosting
        ;;
    *)
        echo "Unknown command: $1"
        echo "Usage: ./deploy.sh [all|portfolio|email|moments|collector|workbook|playball|canitwo|recipebox|psx|solra|myreadingbuddy|mise|seasonal-box|gatekeeper|tophat|party|roy|ezpayze|firestore|storage]"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "  Done!"
echo "========================================"
