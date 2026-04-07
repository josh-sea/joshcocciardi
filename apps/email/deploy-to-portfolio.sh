#!/bin/bash

# Email App Deployment Script
# This script builds the email app and deploys it to the portfolio at /electronic-mail

set -e  # Exit on any error

echo "========================================="
echo "Email App Deployment to Portfolio"
echo "========================================="
echo ""

# Define paths
EMAIL_APP_DIR="/Users/joshcocciardi/Downloads/Develop/countdown"
PORTFOLIO_DIR="/Users/joshcocciardi/Downloads/Develop/joshcocciardi"

# Step 1: Build the email app
echo "Step 1: Building email app..."
cd "$EMAIL_APP_DIR"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Email app build failed!"
    exit 1
fi
echo "✅ Email app built successfully"
echo ""

# Step 2: Copy email app and Firestore config to portfolio
echo "Step 2: Copying email app to portfolio..."
mkdir -p "$PORTFOLIO_DIR/public/electronic-mail"
rm -rf "$PORTFOLIO_DIR/public/electronic-mail"/*
cp -r "$EMAIL_APP_DIR/build"/* "$PORTFOLIO_DIR/public/electronic-mail/"

if [ $? -ne 0 ]; then
    echo "❌ Failed to copy email app to portfolio!"
    exit 1
fi
echo "✅ Email app copied to portfolio/public/electronic-mail"
echo ""

# Copy Firestore rules and indexes
echo "Step 2b: Copying Firestore configuration..."
cp "$EMAIL_APP_DIR/firestore.rules" "$PORTFOLIO_DIR/firestore.rules"
cp "$EMAIL_APP_DIR/firestore.indexes.json" "$PORTFOLIO_DIR/firestore.indexes.json"

if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Could not copy Firestore configuration"
fi
echo "✅ Firestore configuration copied"
echo ""

# Step 3: Build portfolio (includes email app)
echo "Step 3: Building portfolio..."
cd "$PORTFOLIO_DIR"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Portfolio build failed!"
    exit 1
fi
echo "✅ Portfolio built successfully"
echo ""

# Step 4: Deploy Firestore rules and indexes
echo "Step 4: Deploying Firestore configuration..."
cd "$PORTFOLIO_DIR"
firebase deploy --only firestore:rules,firestore:indexes

if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Firestore deployment failed (continuing anyway...)"
else
    echo "✅ Firestore rules and indexes deployed"
fi
echo ""

# Step 5: Deploy to Firebase (hosting + any remaining config)
echo "Step 5: Deploying to Firebase hosting..."
firebase deploy --only hosting

if [ $? -ne 0 ]; then
    echo "❌ Firebase deployment failed!"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "Your apps are now live at:"
echo "  Portfolio:  https://www.joshcocciardi.com"
echo "  Email App:  https://www.joshcocciardi.com/electronic-mail"
echo ""
echo "Remember to hard refresh (Cmd+Shift+R) to see changes!"