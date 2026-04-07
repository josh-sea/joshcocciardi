# Fixing the Firebase Permissions Error

## The Problem

Your app was getting this error:
```
FirebaseError: Missing or insufficient permissions.
```

This occurred because your Firestore database doesn't have security rules configured to allow your app to write authentication tokens to the `gmail_tokens` collection.

## The Solution

I've created a `firestore.rules` file with the necessary security rules. Now you need to deploy these rules to your Firebase project.

## Steps to Deploy Security Rules

### Option 1: Using Firebase Console (Easiest)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on **Firestore Database** in the left sidebar
4. Click on the **Rules** tab at the top
5. Copy the contents of the `firestore.rules` file from this project
6. Paste it into the rules editor in the Firebase Console
7. Click **Publish** to deploy the rules

### Option 2: Using Firebase CLI

If you have the Firebase CLI installed:

```bash
# Install Firebase CLI if you haven't already
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not already done)
firebase init firestore

# Deploy the rules
firebase deploy --only firestore:rules
```

## Updated Security Rules

The `firestore.rules` file has been updated to include the `gmail_tokens` collection rule alongside your existing radar-related rules:

```javascript
match /gmail_tokens/{email} {
  allow read, write: if true;  // Allows OAuth token storage
}
```

This rule is placed before your catch-all authentication rule, so it takes precedence and allows the Gmail OAuth flow to work without Firebase Authentication.

**Your existing rules remain unchanged:**
- `radar_sites` - read-only access
- `radar_scans` - read-only access  
- `client_usage` - open read/write access
- Catch-all rule requiring Firebase Auth for other collections

## ⚠️ Important Security Notice

### For Development
The current rules work fine for local development and testing.

### For Production
You **MUST** implement proper authentication before deploying to production. Here are your options:

#### Option A: Add Firebase Authentication (Recommended)

Integrate Firebase Authentication alongside your Google OAuth flow:

1. Enable Google Sign-In in Firebase Console → Authentication → Sign-in method
2. Update your auth code to also sign in with Firebase Auth
3. Update security rules to:
```javascript
match /gmail_tokens/{email} {
  allow read, write: if request.auth != null && request.auth.token.email == email;
}
```

#### Option B: Use Cloud Functions

Move token storage logic to Cloud Functions with proper authentication validation.

#### Option C: Use Firebase App Check

Add Firebase App Check to prevent unauthorized access from non-app clients.

## Testing the Fix

After deploying the rules:

1. Clear your browser cache and local storage
2. Restart your app
3. Try signing in with Google
4. The permissions error should be resolved

## Verifying Rules Are Active

In Firebase Console → Firestore Database → Rules, you should see:
- Your rules published
- A timestamp showing when they were last deployed

## Next Steps

1. ✅ Deploy the security rules (using one of the options above)
2. ✅ Test your app to verify the error is fixed
3. ⚠️ Before production: Implement proper authentication (Option A recommended)
4. ⚠️ Review and test security rules thoroughly

## Questions?

If you still see the permissions error after deploying:
- Check that the rules were successfully published in Firebase Console
- Verify your Firebase project ID matches in `.env`
- Try signing out and back in
- Check browser console for any additional errors