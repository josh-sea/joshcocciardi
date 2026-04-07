#!/bin/bash
# Unified deploy script for joshcocciardi monorepo
#
# Usage:
#   ./deploy.sh all          - Build all apps and deploy hosting + firestore
#   ./deploy.sh portfolio    - Build portfolio only, deploy hosting
#   ./deploy.sh email        - Build email app, copy to portfolio, deploy hosting
#   ./deploy.sh moments      - Build moment-capture, copy to portfolio, deploy hosting
#   ./deploy.sh firestore    - Deploy firestore rules + indexes only
#   ./deploy.sh storage      - Deploy storage rules only
#
# Apps live in:
#   apps/portfolio/   - Main React portfolio SPA (CRA)
#   apps/email/       - Gmail reader app (CRA) → served at /projects/electronic-mail
#   apps/moment-capture/ - Moment capture app (Vite) → served at /projects/moments
#
# Firebase deploys from: apps/portfolio/build/
# All sub-apps are built into apps/portfolio/public/ before portfolio builds.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTFOLIO_DIR="$ROOT_DIR/apps/portfolio"
EMAIL_DIR="$ROOT_DIR/apps/email"
MOMENTS_DIR="$ROOT_DIR/apps/moment-capture"

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
        echo "Usage: ./deploy.sh [all|portfolio|email|moments|firestore|storage]"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "  Done!"
echo "========================================"
