# Firebase Authentication Setup

## Overview

This app now uses a two-tier authentication system:
1. **Firebase Auth** - For user accounts (email/password or Google Sign-In)
2. **Gmail OAuth** - For Gmail API access (only needed once)

## How It Works

### First Time Setup
1. User creates account or signs in with Firebase (email/password or Google)
2. App checks Firestore for stored Gmail token
3. If no token found, user is prompted to authorize Gmail access (ONE TIME)
4. Gmail token is stored in Firestore under their email address
5. User can now access their Gmail messages

### Subsequent Logins
1. User signs in with Firebase (email/password or Google Sign-In)
2. App automatically loads their Gmail token from Firestore
3. If token is valid, user goes straight to their messages
4. **No Gmail OAuth popup needed!**

### Token Management
- Gmail tokens are stored in Firestore collection: `gmail_tokens`
- Each document is keyed by the user's email address
- Tokens include: `access_token`, `expires_at`, `scope`, `email`, `name`, `picture`
- Tokens are automatically refreshed before expiration
- If a token expires and can't be refreshed, user is prompted to re-authorize

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     User Opens App                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Signed into Firebase?│
              └──────────┬───────────┘
                         │
           ┌─────────────┴─────────────┐
           │ No                        │ Yes
           ▼                           ▼
    ┌──────────────┐          ┌────────────────┐
    │ Auth Screen  │          │ Check Firestore│
    │ Email/Pass   │          │ for Gmail Token│
    │ or Google    │          └────────┬───────┘
    └──────┬───────┘                   │
           │                  ┌─────────┴─────────┐
           │                  │ Valid?            │
           │                  └────────┬──────────┘
           │                           │
           │            ┌──────────────┴────────────┐
           │            │ Yes                       │ No
           │            ▼                           ▼
           │     ┌─────────────┐          ┌──────────────────┐
           │     │   Threads   │          │ Gmail Auth Screen│
           │     │    View     │          │ "Authorize Gmail"│
           │     └─────────────┘          └────────┬─────────┘
           │                                       │
           └───────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Google OAuth Flow│
                    │  (ONE TIME)      │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Store Token in │
                    │   Firestore    │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Threads View  │
                    └────────────────┘
```

## Files Modified

### Core Authentication
- `src/config/firebase.js` - Added Firebase Auth SDK
- `src/services/auth.js` - Added Firebase Auth functions alongside Gmail OAuth
- `src/components/AuthScreen.js` - Updated with email/password form and Google Sign-In
- `src/components/GmailAuthScreen.js` - New screen for Gmail authorization
- `src/App.js` - Updated auth flow to use Firebase first, then Gmail tokens

### Styling
- `src/App.css` - Added styles for new auth components

## Environment Variables

Make sure you have these set in your `.env` file:

```env
# Firebase Config
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Google OAuth (for Gmail API)
REACT_APP_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
```

## Firebase Console Setup

1. **Enable Authentication Methods:**
   - Go to Firebase Console → Authentication → Sign-in methods
   - Enable "Email/Password"
   - Enable "Google" (optional, for easier sign-in)

2. **Firestore Rules:**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /gmail_tokens/{email} {
         // Users can only read/write their own token
         allow read, write: if request.auth != null && request.auth.token.email == email;
       }
     }
   }
   ```

## Benefits

✅ **No more OAuth popup spam** - Gmail authorization happens once  
✅ **Simple daily login** - Just email/password or Google Sign-In  
✅ **Secure** - Tokens stored in Firestore with proper access rules  
✅ **Cross-device** - Tokens follow the user across devices  
✅ **Automatic refresh** - Tokens are refreshed before expiration  
✅ **Flexible** - Supports both email/password and Google Sign-In  

## User Experience

### New User
1. Click "Sign Up" → Enter email/password → Account created
2. "Authorize Gmail Access" button → Google consent screen (ONE TIME)
3. Access granted → Can now view Gmail messages
4. Next login: Just email/password → Straight to messages!

### Returning User
1. Enter email/password (or click "Continue with Google")
2. App loads Gmail token from Firestore
3. Straight to messages - **No OAuth popup!**

## Troubleshooting

### "Please authorize Gmail access"
- This means no Gmail token is stored for your account
- Click "Authorize Gmail Access" to complete the one-time setup

### "Gmail access expired. Please re-authorize"
- Gmail tokens can expire if not used for a long time
- Click "Authorize Gmail Access" to get a new token

### "Authentication failed"
- Check that Firebase Auth is enabled in your Firebase Console
- Verify your environment variables are correct