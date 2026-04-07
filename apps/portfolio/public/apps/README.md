# React JSX Apps Deployment Guide

This directory supports deploying React applications as single JSX files or directories. Perfect for quickly deploying AI-generated JSX/HTML output!

## 📁 Directory Structure

```
public/apps/
├── README.md              # This file
├── viewer.html            # Runtime JSX viewer
├── example-app.jsx        # Example JSX application
└── [your-apps].jsx        # Your JSX files
```

## 🚀 Quick Start

### Method 1: Runtime JSX Viewer (Fastest)

This method transpiles JSX in the browser using Babel Standalone - perfect for quick deployment!

1. **Drop your JSX file** into `public/apps/`
2. **Access it via the viewer**:
   ```
   https://yoursite.com/apps/viewer.html?file=your-app.jsx
   ```

**Example:**
```
https://yoursite.com/apps/viewer.html?file=example-app.jsx
```

**Pros:**
- ✅ No build step required
- ✅ Instant deployment
- ✅ Perfect for testing and demos

**Cons:**
- ⚠️ Slower initial load (transpiles in browser)
- ⚠️ Requires internet for CDN libraries

### Method 2: Build to Standalone HTML (Production-Ready)

Convert JSX files to standalone HTML files that can be deployed directly.

#### Single File:
```bash
npm run build:jsx public/apps/your-app.jsx
# Or with custom output:
npm run build:jsx public/apps/your-app.jsx public/apps/my-app.html
```

#### Entire Directory:
```bash
npm run build:jsx-dir
# This builds all .jsx files in public/apps/
```

**Pros:**
- ✅ Production-ready
- ✅ Faster load times
- ✅ Self-contained HTML files

**Access the built HTML:**
```
https://yoursite.com/apps/your-app.html
```

## 📝 JSX File Requirements

Your JSX files should export an `App` component:

```jsx
function App() {
    const [count, setCount] = React.useState(0);

    return (
        <div>
            <h1>My App</h1>
            <button onClick={() => setCount(count + 1)}>
                Count: {count}
            </button>
        </div>
    );
}
```

### Important Notes:
- Use `React.useState`, `React.useEffect`, etc. (not import statements)
- All React hooks must be prefixed with `React.`
- Use inline styles or style tags (no external CSS imports)
- The component must be named `App`

## 💡 Working with AI-Generated Code

When you get JSX or HTML from AI tools like Claude, ChatGPT, etc.:

### If you receive a JSX file:
1. Save it to `public/apps/your-app.jsx`
2. Use viewer or build it: `npm run build:jsx public/apps/your-app.jsx`

### If you receive HTML with React:
1. Extract the JSX code from the `<script type="text/babel">` section
2. Save just the JSX as `your-app.jsx`
3. Use the viewer or build script

### If you receive a full React component with imports:
Convert it to use React globals:
```jsx
// Change this:
import React, { useState } from 'react';

// To this:
// (Remove import line, use React.useState directly)
const [count, setCount] = React.useState(0);
```

## 🛠️ Advanced Usage

### Custom HTML Template

If you need to customize the HTML wrapper, edit `scripts/build-jsx-app.js` to modify:
- Page title
- Additional CSS
- External libraries
- Meta tags

### Multiple Component Files

For more complex apps with multiple components, you can:

1. **Include all components in one JSX file:**
```jsx
function Header() {
    return <h1>My Header</h1>;
}

function Footer() {
    return <footer>My Footer</footer>;
}

function App() {
    return (
        <div>
            <Header />
            <main>Content</main>
            <Footer />
        </div>
    );
}
```

2. **Or use the viewer with external components** (requires CORS):
```jsx
// In your main app.jsx, fetch external component
async function loadComponent(url) {
    const response = await fetch(url);
    const code = await response.text();
    // Use eval or Function constructor carefully
}
```

## 🔥 Firebase Deployment

The `firebase.json` is already configured to serve the `/apps` directory directly:

```bash
npm run build              # Build your main React app
npm run build:jsx-dir      # Build all JSX apps (optional)
firebase deploy
```

Your apps will be available at:
- Runtime viewer: `https://yoursite.com/apps/viewer.html?file=app.jsx`
- Built HTML: `https://yoursite.com/apps/app.html`

## 📚 Examples

### Example 1: Counter App
See `example-app.jsx` for a complete working example.

### Example 2: Form App
```jsx
function App() {
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [submitted, setSubmitted] = React.useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setSubmitted(true);
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>Contact Form</h1>
            {!submitted ? (
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ display: 'block', margin: '10px 0', padding: '10px' }}
                    />
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ display: 'block', margin: '10px 0', padding: '10px' }}
                    />
                    <button type="submit" style={{ padding: '10px 20px' }}>
                        Submit
                    </button>
                </form>
            ) : (
                <div>
                    <h2>Thank you, {name}!</h2>
                    <p>We'll contact you at {email}</p>
                </div>
            )}
        </div>
    );
}
```

### Example 3: Data Fetching
```jsx
function App() {
    const [data, setData] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        fetch('https://api.example.com/data')
            .then(response => response.json())
            .then(data => {
                setData(data);
                setLoading(false);
            })
            .catch(error => {
                console.error('Error:', error);
                setLoading(false);
            });
    }, []);

    if (loading) return <div>Loading...</div>;

    return (
        <div>
            <h1>Data from API</h1>
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    );
}
```

## 🐛 Troubleshooting

### "App is not defined" error
- Make sure your function is named `App`
- Ensure the function is in the global scope

### Styles not working
- Use inline styles: `style={{ color: 'red' }}`
- Or include styles in a `<style>` tag in the built HTML

### Hooks not working
- Use `React.useState`, not `useState`
- Make sure React is loaded before your code

### CORS errors with viewer
- JSX files must be served from the same origin or have CORS enabled
- For external URLs, ensure the server allows CORS

## 📖 Additional Resources

- [React Documentation](https://react.dev)
- [Babel Standalone](https://babeljs.io/docs/en/babel-standalone)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)

## 🎉 Happy Coding!

Now you can quickly deploy any JSX app from AI tools or your own code!
