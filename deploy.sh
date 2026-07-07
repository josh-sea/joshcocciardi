#!/bin/bash
# Unified deploy script for joshcocciardi monorepo
#
# Usage:
#   ./deploy.sh all          - Build all apps and deploy hosting + firestore
#   ./deploy.sh portfolio    - Build portfolio only, deploy hosting
#   ./deploy.sh email        - Build email app, copy to portfolio, deploy hosting
#   ./deploy.sh moments      - Build moment-capture, copy to portfolio, deploy hosting
#   ./deploy.sh playball     - Copy playball (no build), copy to portfolio, deploy hosting
#   ./deploy.sh canitwo      - Copy canitwo (no build), copy to portfolio, deploy hosting
#   ./deploy.sh recipebox    - Copy recipebox (no build), copy to portfolio, deploy hosting
#   ./deploy.sh firestore    - Deploy firestore rules + indexes only
#   ./deploy.sh storage      - Deploy storage rules only
#
# Apps live in:
#   apps/portfolio/   - Main React portfolio SPA (CRA)
#   apps/email/       - Gmail reader app (CRA) → served at /projects/electronic-mail
#   apps/moment-capture/ - Moment capture app (Vite) → served at /projects/moments
#   apps/playball/    - Playball walk-up music app (static) → served at /projects/playball
#   apps/canitwo/     - CanITwo bathroom finder (static) → served at /projects/canitwo
#   apps/recipebox/   - Recipe Box family recipe cards (static) → served at /projects/recipebox
#
# Firebase deploys from: apps/portfolio/build/
# All sub-apps are built into apps/portfolio/public/ before portfolio builds.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTFOLIO_DIR="$ROOT_DIR/apps/portfolio"
EMAIL_DIR="$ROOT_DIR/apps/email"
MOMENTS_DIR="$ROOT_DIR/apps/moment-capture"
PLAYBALL_DIR="$ROOT_DIR/apps/playball"
CANITWO_DIR="$ROOT_DIR/apps/canitwo"
RECIPEBOX_DIR="$ROOT_DIR/apps/recipebox"

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
    echo "  Email:          https://www.joshcocciardi.com/projects/electronic-mail"
    echo "  Moments:        https://www.joshcocciardi.com/projects/moments"
    echo "  Playball:       https://www.joshcocciardi.com/projects/playball"
    echo "  CanITwo:        https://www.joshcocciardi.com/projects/canitwo"
    echo "  Recipe Box:     https://www.joshcocciardi.com/projects/recipebox"
    echo "  Dead Net:       https://www.joshcocciardi.com/projects/deadnet"
    echo "  Tools:          https://www.joshcocciardi.com/tools"
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
        build_playball
        build_canitwo
        build_recipebox
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
        echo "Usage: ./deploy.sh [all|portfolio|email|moments|playball|canitwo|recipebox|firestore|storage]"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "  Done!"
echo "========================================"
