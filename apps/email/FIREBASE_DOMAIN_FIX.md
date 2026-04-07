# Firebase Authorized Domain Setup

## Problem
You're getting this error:
```
The current domain is not authorized for OAuth operations. 
Add your domain (www.joshcocciardi.com) to the OAuth redirect domains list.
```

## Solution

### Step 1: Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project

### Step 2: Navigate to Authentication Settings
1. Click on **Authentication** in the left sidebar
2. Click on the **Settings** tab
3. Scroll down to **Authorized domains** section

### Step 3: Add Your Domain
1. Click **Add domain**
2. Enter: **www.joshcocciardi.com**
3. Click **Add**

### Step 4: Add Additional Domains (Optional but Recommended)
It's a good practice to also add the non-www version:
1. Click **Add domain** again
2. Enter: **joshcocciardi.com**
3. Click **Add**

### Default Domains
You should see these already authorized:
- `localhost` (for local development)
- `*.firebaseapp.com` (your Firebase hosting domain)

### Important Notes
- Changes take effect immediately
- You don't need to redeploy your app
- Both www and non-www versions should be added for best compatibility
- Make sure your domain matches exactly what users see in their browser

### Verify the Fix
After adding the domain:
1. Go to your website: https://www.joshcocciardi.com
2. Try to sign in again
3. The OAuth popup should now work correctly

## Troubleshooting
- **Still not working?** Clear your browser cache and try again
- **Different domain in URL?** Make sure to add the exact domain shown in the error message
- **Using HTTPS?** Make sure your domain uses HTTPS (which it should for OAuth)
