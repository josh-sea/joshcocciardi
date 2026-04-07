# Vite + React Guide for Your Project

## What is Vite?

Vite is a modern build tool that's now the **recommended** way to build React applications. It's much faster than the older Create React App (CRA) and is officially endorsed by the React team.

## Your Current Setup

Your project is already configured with:
- **React 19.2.0** - Latest React version
- **Vite 8.0.0** - Modern, fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Firebase** - Backend services
- **PWA Support** - Progressive Web App capabilities
- **React Router** - Client-side routing

## Key Differences from Create React App

| Feature | Vite | Create React App |
|---------|------|------------------|
| **Speed** | ⚡ Extremely fast (uses esbuild) | Slower (uses webpack) |
| **Dev Server** | Instant hot reload | Slower refresh |
| **Build Time** | Much faster | Slower |
| **Status** | ✅ Actively maintained | ⚠️ Deprecated (no longer recommended) |
| **File Structure** | Similar | Similar |

## How to Use Your Vite + React App

### 1. Development Commands

```bash
# Start development server (with hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

### 2. Project Structure

```
moment-capture/
├── public/              # Static assets (served as-is)
│   └── icons/          # PWA icons
├── src/
│   ├── components/     # React components
│   ├── contexts/       # React contexts
│   ├── hooks/          # Custom React hooks
│   ├── services/       # Firebase services
│   ├── utils/          # Helper functions
│   ├── App.jsx         # Main app component
│   ├── main.jsx        # App entry point (like index.js in CRA)
│   └── index.css       # Global styles
├── index.html          # HTML template (at root, not in public/)
├── vite.config.js      # Vite configuration
└── package.json        # Dependencies
```

### 3. Key Files Explained

#### `main.jsx` (Entry Point)
This is like `index.js` in Create React App. It renders your app:
```jsx
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
```

#### `index.html` (Root HTML)
Unlike CRA, this is at the **root** of your project, not in `public/`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Moment Capture</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

#### `vite.config.js` (Configuration)
This configures Vite plugins and settings:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Add more configuration as needed
})
```

### 4. Importing Assets

#### Images and Static Files
```jsx
// Import from src
import logo from './assets/logo.png'

// Use in JSX
<img src={logo} alt="Logo" />

// Public folder (accessed directly)
<img src="/icons/icon-192.png" alt="Icon" />
```

#### CSS
```jsx
// Global CSS
import './index.css'

// Component CSS
import './Button.css'

// Tailwind CSS (already configured in your project)
```

### 5. Environment Variables

Create `.env` files for environment variables:

```bash
# .env (for all environments)
VITE_API_KEY=your_key_here

# .env.local (for local development, gitignored)
VITE_FIREBASE_API_KEY=your_firebase_key
```

**Important**: All variables must start with `VITE_` to be exposed to your app.

Access them in your code:
```js
const apiKey = import.meta.env.VITE_API_KEY
```

### 6. Hot Module Replacement (HMR)

Vite's HMR is **instant**. When you save a file:
- ✅ Component state is preserved
- ✅ Changes appear immediately
- ✅ No full page reload (unless needed)

### 7. Building for Production

```bash
# Build the app
npm run build

# This creates a `dist/` folder with:
# - Optimized JavaScript
# - Minified CSS
# - Hashed filenames for caching
```

Deploy the `dist/` folder to your hosting service.

### 8. PWA (Progressive Web App)

Your project already has PWA support via `vite-plugin-pwa`:
- ✅ Service worker for offline support
- ✅ App manifest for installation
- ✅ Firebase Storage caching

### 9. Firebase Integration

Your services are already set up:
```js
// Authentication
import { auth } from './services/auth.service.js'

// Firestore
import { db } from './services/firestore.service.js'

// Storage
import { storage } from './services/storage.service.js'
```

### 10. Common Tasks

#### Add a New Component
```jsx
// src/components/MyComponent/MyComponent.jsx
export default function MyComponent() {
  return <div>Hello!</div>
}

// Use it in App.jsx
import MyComponent from './components/MyComponent/MyComponent'
```

#### Add a New Route
```jsx
// In your router setup
import { BrowserRouter, Routes, Route } from 'react-router-dom'

<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/gallery" element={<Gallery />} />
</Routes>
```

#### Add a New Dependency
```bash
npm install package-name
```

## Why Vite is Better

1. **⚡ Speed**: Dev server starts in milliseconds
2. **🔥 Hot Reload**: Instant updates without losing state
3. **📦 Optimized Builds**: Smaller bundle sizes
4. **🎯 Modern**: Uses native ES modules
5. **🛠️ Better DX**: Better error messages and debugging
6. **✅ Recommended**: Official recommendation from React team

## Troubleshooting

### Port Already in Use
```bash
# Vite default port is 5173
# Change it in vite.config.js:
export default defineConfig({
  server: {
    port: 3000
  }
})
```

### Import Errors
- Use `.jsx` extension for JSX files
- Use relative paths: `./Component` not `Component`
- Public files: use `/` prefix: `/icons/logo.png`

### Environment Variables Not Working
- Must start with `VITE_`
- Use `import.meta.env.VITE_VAR_NAME`
- Restart dev server after adding new variables

## Next Steps

1. **Start the dev server**: `npm run dev`
2. **Open your browser**: Usually `http://localhost:5173`
3. **Start coding**: Edit `src/App.jsx` to see instant changes
4. **Build components**: Create new components in `src/components/`
5. **Use Firebase**: Your services are already configured

## Resources

- [Vite Documentation](https://vite.dev)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Firebase](https://firebase.google.com/docs)

---

**You're all set!** Your Vite + React setup is modern, fast, and ready to use. Just run `npm run dev` and start building! 🚀
