# Firebase CMS Setup Guide

This guide will help you set up Firebase and Firestore for your remote tool creation system.

## What You've Built

You now have a complete CRUD (Create, Read, Update, Delete) system for managing HTML tools remotely:

- **`/tools/new.html`** - Create new tools with a form interface
- **`/tools/view.html?id=xxx`** - View dynamic tools loaded from Firestore
- **`/tools/edit.html?id=xxx`** - Edit existing tools
- **`/tools/index.html`** - Dashboard listing all tools (static + dynamic)

## Setup Steps

### 1. Enable Firestore in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. In the left sidebar, click **Build** → **Firestore Database**
4. Click **Create database**
5. Choose **Start in test mode** (we'll secure it later)
6. Select a Cloud Firestore location (choose one close to your users)
7. Click **Enable**

### 2. Get Your Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ → **Project settings**
2. Scroll down to **Your apps** section
3. Click on your web app (or create one if you haven't)
4. Copy the `firebaseConfig` object

It will look like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

### 3. Update Firebase Config in Your Files

Replace the placeholder config in these files with your actual Firebase configuration:

- `public/tools/new.html` (line ~327)
- `public/tools/view.html` (line ~171)
- `public/tools/edit.html` (line ~351)
- `public/tools/index.html` (line ~230)

**Find and replace this:**
```javascript
const firebaseConfig = {
    // TODO: Add your Firebase config here
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

**With your actual config:**
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};
```

### 4. Set Up Firestore Security Rules

Since your tools are already protected by authentication (via `auth.js`), you can use simple security rules.

In Firebase Console:
1. Go to **Firestore Database** → **Rules**
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write for all authenticated users
    // Since you have client-side auth, you can either:
    
    // Option A: Allow all (since your pages are already password-protected)
    match /tools/{toolId} {
      allow read, write: if true;
    }
    
    // Option B: Require Firebase Authentication (recommended for production)
    // You would need to implement Firebase Auth to replace your current auth.js
    // match /tools/{toolId} {
    //   allow read, write: if request.auth != null;
    // }
  }
}
```

3. Click **Publish**

### 5. Build and Deploy

1. Build your React app:
   ```bash
   npm run build
   ```

2. Deploy to Firebase:
   ```bash
   firebase deploy
   ```

## How to Use

### Creating a New Tool

1. Log in to `/tools/login.html` (username: `admin`, password: `admin`)
2. Go to `/tools/index.html` dashboard
3. Click **"Create New Tool"** card
4. Fill in the form:
   - **Title**: Display name for your tool
   - **Slug**: URL-friendly identifier (auto-generated from title)
   - **Description**: Brief description
   - **Icon**: Emoji to represent your tool
   - **HTML Content**: Your complete HTML (can include CSS and JavaScript)
5. Click **"Preview"** to test before saving
6. Click **"Create Tool"** to save

Your tool is now instantly available at `/tools/view.html?id=your-slug`

### Editing a Tool

1. From the dashboard, click on any dynamic tool (marked with blue left border)
2. Click **"Edit"** button in the header
3. Modify the content
4. Click **"Save Changes"**

### Deleting a Tool

1. Open the tool in edit mode
2. Click **"Delete Tool"** button (red button on the right)
3. Confirm deletion

## Important Notes

### No Rebuild Required

- Dynamic tools created through the CMS are stored in Firestore
- They're rendered client-side via `/tools/view.html`
- No need to rebuild or redeploy when creating/editing tools
- Changes are instant!

### Static vs Dynamic Tools

- **Static tools**: HTML files in `public/tools/` (like `sample.html`, `closet.html`)
  - Require rebuild and redeploy to update
  - Faster load times
  - Good for tools that rarely change

- **Dynamic tools**: Stored in Firestore
  - Instantly available after creation
  - Can be edited through web interface
  - Slightly slower first load (needs to fetch from Firestore)
  - Perfect for frequently updated tools

### Authentication

The current system uses simple client-side authentication (`admin/admin`). This is fine for personal use, but for production:

- Consider implementing Firebase Authentication
- Update Firestore security rules to require authentication
- The auth.js system provides basic protection but can be bypassed

### Firestore Costs

- Firestore has a generous free tier:
  - 50K reads/day
  - 20K writes/day
  - 1 GiB storage

- For a personal tools site, you'll likely stay within free tier

## Troubleshooting

### "Firebase is not initialized" error

- Make sure you've replaced the placeholder config with your actual Firebase config
- Check browser console for specific error messages

### Tools not appearing in dashboard

- Open browser console and check for errors
- Verify Firestore is enabled in Firebase Console
- Check Firestore security rules allow read access

### Can't save tools

- Check Firestore security rules allow write access
- Verify your Firebase config is correct
- Check browser console for errors

## Next Steps (Optional Enhancements)

1. **Add Firebase Authentication**:
   - Replace `auth.js` with proper Firebase Auth
   - Support multiple users with different permissions

2. **Add Categories/Tags**:
   - Organize tools by category
   - Add filtering in dashboard

3. **Export to Static**:
   - Add a function to export Firestore tools to static HTML files
   - Best of both worlds: dynamic creation + static hosting

4. **Version History**:
   - Store previous versions of tools in Firestore
   - Add rollback functionality

5. **Rich Text Editor**:
   - Integrate a WYSIWYG editor for easier content creation
   - Add syntax highlighting for code editing

## Summary

You now have a complete Firestore-based CMS for creating and managing HTML tools remotely. No more manual file editing, rebuilding, or redeploying for every new tool!

- Create tools instantly through web interface
- Edit and delete tools on the fly
- Preview before publishing
- All changes are live immediately

Enjoy your new tool creation workflow! 🚀
