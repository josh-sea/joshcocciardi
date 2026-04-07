# Tools Directory

This directory hosts password-protected HTML pages accessible at `joshcocciardi.com/tools`.

## Authentication

- **Username:** admin
- **Password:** admin
- Authentication persists for the browser session
- Users are automatically redirected to login if not authenticated

## File Structure

```
public/tools/
├── auth.js          # Authentication system
├── login.html       # Login page
├── index.html       # Protected dashboard/landing page
├── sample.html      # Sample tool demonstrating the system
└── README.md        # This file
```

## How to Add New Tools

### 1. Create Your HTML File

Create a new HTML file in the `public/tools/` directory (e.g., `mytool.html`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Tool - Josh Cocciardi</title>
    <!-- Your styles here -->
</head>
<body>
    <!-- Your content here -->
    
    <!-- Required for authentication -->
    <script src="auth.js"></script>
    <script>
        protectPage(); // This protects the page
    </script>
    
    <!-- Your scripts here -->
</body>
</html>
```

### 2. Add to Dashboard (Optional)

Edit `index.html` to add a card linking to your new tool:

```html
<a href="mytool.html" class="tool-card">
    <div class="tool-icon">🎯</div>
    <h3>My Tool</h3>
    <p>Description of what your tool does.</p>
</a>
```

### 3. Build and Deploy

```bash
# Build the React app (copies public/tools/ to build/tools/)
npm run build

# Deploy to Firebase
firebase deploy
```

## Available Authentication Functions

The `auth.js` file provides these functions:

- `protectPage()` - Redirects to login if not authenticated (use on protected pages)
- `redirectIfAuthenticated()` - Redirects to index if already authenticated (use on login page)
- `logout()` - Logs out the user and redirects to login
- `isAuthenticated()` - Returns true if user is authenticated
- `authenticate(username, password)` - Authenticates user with credentials

## Security Notes

⚠️ **Important:** This is a client-side authentication system suitable for basic access control. The credentials and authentication logic are visible in the client-side JavaScript.

For production use with sensitive data, consider:
- Using Firebase Authentication
- Implementing server-side authentication with Firebase Functions
- Using Firebase Security Rules
- Storing credentials securely server-side

## Accessing Your Tools

After deployment, your tools will be accessible at:
- Login: `https://joshcocciardi.com/tools/login.html`
- Dashboard: `https://joshcocciardi.com/tools/index.html`
- Sample Tool: `https://joshcocciardi.com/tools/sample.html`
- Your Tools: `https://joshcocciardi.com/tools/yourfile.html`

## Changing Credentials

To change the default credentials, edit `auth.js`:

```javascript
const AUTH_CONFIG = {
  username: 'admin',        // Change this
  password: 'admin',        // Change this
  sessionKey: 'tools_authenticated'
};
```

Then rebuild and redeploy.
