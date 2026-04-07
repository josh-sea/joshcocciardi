# Quick Start Guide

## Your Project is Already React + Vite! 🎉

Good news: Your project is already set up with **React 19** and **Vite 8** - the modern, recommended approach for React development.

## Get Started in 3 Steps

### 1. Install Dependencies (if needed)
```bash
cd moment-capture
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```

This will start Vite's dev server. You'll see output like:
```
VITE v8.0.0-beta.14  ready in 123 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

### 3. Open Your Browser
Navigate to `http://localhost:5173/` and you'll see your React app running!

## Available Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production (creates `dist/` folder) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Check code for errors |

## Your Project Structure

```
moment-capture/
├── src/
│   ├── App.jsx          ← Main app component (edit this!)
│   ├── main.jsx         ← App entry point
│   ├── components/      ← Your React components
│   ├── services/        ← Firebase services (auth, storage, firestore)
│   └── utils/           ← Helper functions
├── public/              ← Static files (icons, etc.)
├── index.html           ← HTML template
└── vite.config.js       ← Vite configuration
```

## Making Changes

1. **Edit a component**: Open `src/App.jsx` and make changes
2. **Save the file**: Changes appear instantly in your browser (Hot Module Replacement)
3. **No page reload needed**: Vite updates your app without losing state

## Key Differences from Create React App

- ✅ **Much faster** dev server and builds
- ✅ **Better hot reload** - instant updates
- ✅ **Modern tooling** - uses native ES modules
- ✅ Entry point is `main.jsx` (not `index.js`)
- ✅ `index.html` is at the root (not in `public/`)
- ✅ Environment variables start with `VITE_` (not `REACT_APP_`)

## Environment Variables

Your Firebase config should be in `.env`:
```bash
VITE_FIREBASE_API_KEY=your_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_domain_here
# ... etc
```

Access them in code:
```js
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
```

## Need More Help?

📖 **Read the full guide**: `VITE_GUIDE.md` (comprehensive Vite + React guide)
📚 **Vite Docs**: https://vite.dev
⚛️ **React Docs**: https://react.dev

## Troubleshooting

### Dependencies Warning
You may see warnings about `react-spring` and React 19 compatibility. These are harmless - the app will still run fine.

### Port Already in Use
If port 5173 is taken, Vite will automatically use the next available port (5174, 5175, etc.)

### Changes Not Appearing
1. Make sure the dev server is running (`npm run dev`)
2. Check the browser console for errors
3. Try a hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

---

**You're ready to go!** Just run `npm run dev` and start building! 🚀
