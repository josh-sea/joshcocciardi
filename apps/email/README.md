# Gmail Messages App

A React application that integrates with Gmail API to view and manage email messages. Uses Firebase Firestore for token storage and Google Identity Services for OAuth 2.0 authentication.

## Features

- Gmail OAuth 2.0 authentication
- View email threads and messages
- Send replies
- Mark messages as read
- Secure token storage in Firebase Firestore

## Prerequisites

1. **Firebase Project**
   - Create a project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Firestore Database
   - Get your Firebase configuration

2. **Google Cloud Project with Gmail API**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Gmail API
   - Create OAuth 2.0 Client ID (Web application type)
   - Add authorized JavaScript origins: `http://localhost:3000`
   - Add authorized redirect URIs: `http://localhost:3000`

## Environment Variables

Copy the provided `.env` file and update the following variables:

### Firebase Configuration
Already configured based on your Firebase project:
- `REACT_APP_FIREBASE_API_KEY` ✓
- `REACT_APP_FIREBASE_AUTH_DOMAIN` ✓
- `REACT_APP_FIREBASE_PROJECT_ID` ✓
- `REACT_APP_FIREBASE_STORAGE_BUCKET` ✓
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` ✓
- `REACT_APP_FIREBASE_APP_ID` ✓

### Google Gmail API - **ACTION REQUIRED**
You need to add your Google OAuth 2.0 Client ID:
- `REACT_APP_GOOGLE_CLIENT_ID` - Get this from [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)

**How to get your Google Client ID:**
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Select "Web application"
4. Add `http://localhost:3000` to "Authorized JavaScript origins"
5. Add `http://localhost:3000` to "Authorized redirect URIs"
6. Copy the Client ID (ends with `.apps.googleusercontent.com`)
7. Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` in `.env` with your actual Client ID

### Optional
- `PORT` - Server port (defaults to 3000)

## Installation

Dependencies have been installed. If you need to reinstall:

```bash
npm install
```

## Running the App

### Development Mode
```bash
npm run dev
```
Opens the app at [http://localhost:3000](http://localhost:3000) with hot-reload.

### Production Mode
```bash
npm run build
npm start
```
Builds the app and serves it with Express server.

## Project Structure

```
├── public/              # Static files
├── src/
│   ├── components/      # React components
│   │   ├── AuthScreen.js    # OAuth login screen
│   │   ├── ChatView.js      # Email thread view
│   │   └── ThreadList.js    # List of email threads
│   ├── config/
│   │   └── firebase.js      # Firebase configuration
│   ├── services/
│   │   ├── auth.js          # Google OAuth authentication
│   │   └── gmail.js         # Gmail API integration
│   ├── App.js           # Main app component
│   └── index.js         # App entry point
├── server.js            # Production Express server
└── .env                 # Environment variables
```

## Required Gmail API Scopes

The app requests the following Gmail API permissions:
- `gmail.readonly` - Read email messages
- `gmail.send` - Send email messages
- `gmail.modify` - Modify messages (mark as read)
- `userinfo.email` - Get user email address
- `userinfo.profile` - Get user profile info

## Security Notes

- Never commit your `.env` file (already added to `.gitignore`)
- Store tokens securely in Firebase Firestore
- Tokens are automatically refreshed when expired
- Users can revoke access at any time

## Cleanup Summary

✓ Updated `.env` with proper `REACT_APP_` prefixes (required by React)
✓ Added comprehensive environment variable documentation
✓ Added missing `express` dependency for production server
✓ Moved testing libraries to `devDependencies`
✓ Installed all dependencies
✓ Created detailed setup instructions

## Next Steps

1. **Update your `.env` file** with your Google OAuth 2.0 Client ID
2. Run `npm run dev` to start the development server
3. Authorize the app with your Gmail account
4. Start managing your emails!

## Troubleshooting

### "Google Identity Services not loaded"
- Make sure the Google Identity Services script is loaded in `public/index.html`
- Check browser console for script loading errors

### "Invalid OAuth client"
- Verify your `REACT_APP_GOOGLE_CLIENT_ID` is correct
- Ensure authorized origins and redirect URIs are configured in Google Cloud Console
- Make sure you're accessing the app from `http://localhost:3000`

### Firebase errors
- Verify all Firebase environment variables are correct
- Check that Firestore is enabled in your Firebase project
- Ensure Firebase project has proper permissions

## Support

For issues related to:
- Firebase: [Firebase Documentation](https://firebase.google.com/docs)
- Gmail API: [Gmail API Documentation](https://developers.google.com/gmail/api)
- Google OAuth: [Google Identity Services](https://developers.google.com/identity/gsi/web)