# Google OAuth Configuration for /electronic-mail

## Overview
Your email app is now configured to run at `https://www.joshcocciardi.com/electronic-mail`

## Google Cloud Console Configuration

You need to update your OAuth 2.0 Client ID settings in the Google Cloud Console:

### 1. Go to Google Cloud Console
- Navigate to: https://console.cloud.google.com/apis/credentials
- Select your project: `josh-cocciardi`
- Find your OAuth 2.0 Client ID: `513947581115-0tujc9rllcun5s9oh6pr8mnrkb4vi94u.apps.googleusercontent.com`
- Click "Edit" (pencil icon)

### 2. Update Authorized JavaScript Origins

Add the following origins (if not already present):

```
https://www.joshcocciardi.com
https://joshcocciardi.com
http://localhost:3000
```

**Important:** Do NOT include paths in JavaScript origins (no `/electronic-mail` here)

### 3. Update Authorized Redirect URIs

Add the following redirect URIs:

```
https://www.joshcocciardi.com/electronic-mail
https://www.joshcocciardi.com/electronic-mail/
https://joshcocciardi.com/electronic-mail
https://joshcocciardi.com/electronic-mail/
http://localhost:3000
```

**Note:** Google Identity Services (which your app uses) primarily relies on JavaScript origins, but it's good practice to include the redirect URIs as well.

### 4. Save Changes

Click "Save" at the bottom of the page.

## Deployment Steps

### For Portfolio (fixes favicon issue):
```bash
cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
npm run build
firebase deploy
```

### For Email App (to deploy at /electronic-mail):
```bash
cd /Users/joshcocciardi/Downloads/Develop/countdown
npm run build
# Then deploy the build folder to https://www.joshcocciardi.com/electronic-mail
```

## Firebase Hosting Configuration

If you want to host the email app on the same Firebase project, you'll need to configure Firebase hosting to serve the email app at `/electronic-mail`. This typically involves:

1. Building the app with the new homepage setting
2. Either:
   - **Option A:** Deploy as a subdirectory in your main Firebase hosting
   - **Option B:** Configure Firebase hosting rewrites in `firebase.json`

### Option A: Manual Subdirectory Deployment
After building, copy the build folder contents to your portfolio's public folder under `electronic-mail`:
```bash
cd /Users/joshcocciardi/Downloads/Develop/countdown
npm run build
cp -r build/* /Users/joshcocciardi/Downloads/Develop/joshcocciardi/public/electronic-mail/
cd /Users/joshcocciardi/Downloads/Develop/joshcocciardi
firebase deploy
```

### Option B: Firebase Hosting Rewrites
Add this to your portfolio's `firebase.json`:
```json
{
  "hosting": {
    "public": "build",
    "rewrites": [
      {
        "source": "/electronic-mail/**",
        "destination": "/electronic-mail/index.html"
      }
    ]
  }
}
```

## Testing

After deployment and OAuth configuration:

1. Visit `https://www.joshcocciardi.com` - should show portfolio without favicon errors
2. Visit `https://www.joshcocciardi.com/electronic-mail` - should load email app
3. Click "Sign in with Google" - should successfully authenticate

## Troubleshooting

### "Redirect URI mismatch" error
- Verify the exact URL in the error message
- Add that exact URL to Authorized Redirect URIs in Google Cloud Console
- Make sure to include both with and without trailing slash

### OAuth consent screen issues
- Ensure your OAuth consent screen is configured in Google Cloud Console
- If in testing mode, add test users in the OAuth consent screen settings

### App not loading at /electronic-mail
- Verify the build was created with the correct `homepage` setting
- Check Firebase hosting configuration
- Clear browser cache and try again