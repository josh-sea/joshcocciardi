# Deployment Workflow Guide

## Overview

This email app is deployed as a subpath (`/electronic-mail`) on your portfolio site at `https://www.joshcocciardi.com`. The deployment workflow handles:

1. Building the email app locally
2. Copying it to your portfolio project
3. Deploying Firestore rules and indexes
4. Deploying to Firebase hosting

## Project Structure

```
/Users/joshcocciardi/Downloads/Develop/
├── countdown/                 # This email app
│   ├── src/
│   ├── firestore.rules       # Firestore security rules
│   ├── firestore.indexes.json # Firestore indexes config
│   └── deploy-to-portfolio.sh
│
└── joshcocciardi/            # Your portfolio
    ├── public/
    │   └── electronic-mail/  # Email app deployed here
    ├── firestore.rules       # Copied from email app
    └── firestore.indexes.json # Copied from email app
```

## NPM Scripts

### Development

```bash
# Start local development server
npm run dev
```

Runs the app on `http://localhost:3000`

### Full Deployment (Recommended)

```bash
# Deploy everything to portfolio
npm run deploy
# or
npm run deploy:portfolio
```

**This runs `deploy-to-portfolio.sh` which:**
1. Builds the email app
2. Copies built files to `../joshcocciardi/public/electronic-mail`
3. Copies Firestore configuration to portfolio
4. Builds the portfolio
5. Deploys Firestore rules and indexes
6. Deploys to Firebase hosting

**Result:** App is live at `https://www.joshcocciardi.com/electronic-mail`

### Partial Deployments

#### Deploy Only Firestore Configuration

```bash
npm run deploy:firestore
```

Updates Firestore rules and indexes without redeploying the app. Useful when you've only changed:
- `firestore.rules`
- `firestore.indexes.json`

#### Deploy Only Hosting

```bash
npm run deploy:hosting
```

Deploys the portfolio to Firebase hosting without touching Firestore. Use when you've made changes to the portfolio itself.

#### Copy Firestore Config

```bash
npm run firestore:copy
```

Manually copies `firestore.rules` and `firestore.indexes.json` to the portfolio directory. Rarely needed since the full deploy script handles this.

## Deployment Workflow Details

### What Happens During Full Deployment

```
1. Build Email App
   └─> npm run build
       └─> Creates /build directory

2. Copy to Portfolio
   └─> Copies /build/* to ../joshcocciardi/public/electronic-mail/
   └─> Copies firestore.rules and firestore.indexes.json

3. Build Portfolio
   └─> cd ../joshcocciardi && npm run build

4. Deploy Firestore
   └─> firebase deploy --only firestore:rules,firestore:indexes
       └─> Updates security rules for email cache
       └─> Creates indexes for fast queries

5. Deploy Hosting
   └─> firebase deploy --only hosting
       └─> Uploads portfolio + email app
       └─> Live at joshcocciardi.com
```

## Firestore Configuration

### Security Rules (`firestore.rules`)

The security rules ensure:
- Users can only access their own email data
- Email threads and messages are isolated per user
- No cross-user data access

**Collections protected:**
- `users/{userId}/threads/*`
- `users/{userId}/messages/*`
- `users/{userId}/meta/*`

### Indexes (`firestore.indexes.json`)

Three composite indexes for optimal performance:

1. **Threads by date** (descending)
   - Used for loading recent threads
   
2. **Messages by thread + date** (ascending)
   - Used for loading thread conversation history
   
3. **Messages by date** (descending)
   - Used for global message queries

## Testing Deployment

### Before Full Deployment

1. **Test locally first:**
   ```bash
   npm run dev
   ```
   Verify everything works at `http://localhost:3000`

2. **Build and check for errors:**
   ```bash
   npm run build
   ```
   Check for any build warnings or errors

3. **Run full deployment:**
   ```bash
   npm run deploy
   ```

### After Deployment

1. **Visit the live app:**
   ```
   https://www.joshcocciardi.com/electronic-mail
   ```

2. **Hard refresh** (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
   - Clears browser cache
   - Ensures you see the latest version

3. **Test Firestore:**
   - Sign in
   - Load emails
   - Check browser console for Firestore operations
   - Verify cache is working (should see "Loaded X threads from cache")

## Verifying Firestore Deployment

### Check Firestore Rules

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your portfolio project
3. Navigate to **Firestore Database** → **Rules**
4. Verify rules match your `firestore.rules` file
5. Look for timestamp showing when rules were last deployed

### Check Firestore Indexes

1. In Firebase Console, go to **Firestore Database** → **Indexes**
2. Should see 3 composite indexes:
   - `threads` collection with `date` (DESC)
   - `messages` collection with `threadId` (ASC), `date` (ASC)
   - `messages` collection with `date` (DESC)
3. All should show status: **Enabled**

If indexes show "Building", wait a few minutes. Large collections can take time to index.

## Troubleshooting

### Deployment Fails at Build Step

**Error:** `npm run build` fails

**Solution:**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Firestore Rules Deployment Fails

**Error:** `Warning: Firestore deployment failed`

**Solution:**
1. Check if you're authenticated:
   ```bash
   firebase login
   ```

2. Verify you're in the portfolio directory:
   ```bash
   cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
   firebase deploy --only firestore:rules
   ```

3. Check `firestore.rules` syntax:
   - Make sure no duplicate `service cloud.firestore` blocks
   - Verify all brackets are closed properly

### Indexes Not Creating

**Error:** "Missing index" when running queries

**Solution:**
1. Firebase will show an error with a link to create the index
2. Click the link to auto-create it
3. Or manually create in Firebase Console → Indexes → Add Index

Alternatively, deploy indexes explicitly:
```bash
npm run deploy:firestore
```

### App Not Updating After Deployment

**Issue:** Changes not visible on live site

**Solution:**
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear browser cache entirely
3. Try incognito/private browsing mode
4. Check Firebase Console → Hosting to verify deployment completed
5. Check deployment timestamp matches your latest deploy

### Portfolio Build Fails

**Error:** Portfolio build fails during deployment

**Solution:**
1. Navigate to portfolio directory:
   ```bash
   cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
   ```

2. Test portfolio build independently:
   ```bash
   npm run build
   ```

3. If portfolio build works alone, the issue may be with the email app build output

## Manual Deployment (Alternative Method)

If the automated script fails, you can deploy manually:

### Step 1: Build Email App
```bash
cd /Users/joshcocciardi/Downloads/Develop/countdown
npm run build
```

### Step 2: Copy to Portfolio
```bash
cp -r build/* /Users/joshcocciardi/Downloads/Develop/joshcocciardi/public/electronic-mail/
cp firestore.rules firestore.indexes.json /Users/joshcocciardi/Downloads/Develop/joshcocciardi/
```

### Step 3: Build Portfolio
```bash
cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
npm run build
```

### Step 4: Deploy
```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only hosting
```

## Rollback Process

If you need to rollback a deployment:

### Rollback Hosting

1. Go to Firebase Console → Hosting
2. View deployment history
3. Click "Rollback" on a previous version

### Rollback Firestore Rules

Firestore rules don't have built-in rollback, but you can:

1. Keep a backup of `firestore.rules`
2. Restore the old version
3. Deploy:
   ```bash
   npm run deploy:firestore
   ```

## Best Practices

### 1. Always Test Locally First
```bash
npm run dev
```
Never deploy untested code

### 2. Use Version Control
```bash
git add .
git commit -m "Description of changes"
git push
```
Commit before deploying so you can rollback if needed

### 3. Deploy During Low-Traffic Times
If possible, deploy when fewer users are active

### 4. Monitor After Deployment
- Check browser console for errors
- Test key features (sign in, load emails, send reply)
- Verify Firestore cache is working

### 5. Keep Firestore Config Synced
Always deploy Firestore rules when you change the cache service:
```bash
npm run deploy:firestore
```

## Deployment Checklist

Before running `npm run deploy`:

- [ ] Code tested locally (`npm run dev`)
- [ ] No errors in browser console
- [ ] Changes committed to git
- [ ] Environment variables set correctly
- [ ] Firebase authenticated (`firebase login`)
- [ ] Portfolio directory exists at `../joshcocciardi`

After deployment:

- [ ] Visit https://www.joshcocciardi.com/electronic-mail
- [ ] Hard refresh browser (Cmd+Shift+R)
- [ ] Test sign in
- [ ] Verify emails load from cache
- [ ] Check Firestore rules in Firebase Console
- [ ] Verify indexes are enabled
- [ ] Test key features work

## Common Deployment Scenarios

### Scenario 1: Quick UI Fix
You fixed a CSS bug or typo.

```bash
# Test locally
npm run dev

# Deploy everything
npm run deploy
```

### Scenario 2: Changed Firestore Rules
You updated security rules or indexes.

```bash
# Copy to portfolio
npm run firestore:copy

# Deploy just Firestore
npm run deploy:firestore
```

### Scenario 3: Major Feature Addition
You added email caching or new functionality.

```bash
# Test thoroughly locally
npm run dev

# Full deployment
npm run deploy
```

### Scenario 4: Hotfix in Production
Critical bug needs immediate fix.

```bash
# Fix the bug
# Test locally
npm run dev

# Deploy immediately
npm run deploy

# Monitor live site
# Be ready to rollback if needed
```

## Environment Variables

The app uses environment variables for Firebase config. These should be set in your portfolio project:

```env
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-domain.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
```

## Monitoring Deployment Health

### Check Deployment Status

```bash
cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
firebase hosting:channel:list
```

### View Firestore Usage

1. Firebase Console → Firestore Database → Usage
2. Monitor:
   - Reads/writes per day
   - Storage used
   - Index builds

### Check for Errors

1. Firebase Console → Firestore Database → Rules Playground
2. Test your rules with sample queries
3. Verify they work as expected

## Summary

**Primary deployment command:**
```bash
npm run deploy
```

This handles everything:
- ✅ Builds email app
- ✅ Copies to portfolio
- ✅ Deploys Firestore rules & indexes
- ✅ Deploys to hosting
- ✅ Live at joshcocciardi.com/electronic-mail

**For Firestore-only updates:**
```bash
npm run deploy:firestore
```

**Always remember:**
- Test locally first
- Hard refresh after deployment
- Monitor console for errors
- Keep git commits up to date

Your email app with Firestore caching is now production-ready! 🚀