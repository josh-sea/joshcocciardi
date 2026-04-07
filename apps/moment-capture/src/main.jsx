import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Safety check: if this app is being served by a stale service worker at the
// wrong URL (e.g. joshcocciardi.com/ instead of /projects/moments/), detect
// that and nuke all service workers + reload so the correct page loads.
if ('serviceWorker' in navigator && !window.location.pathname.startsWith('/projects/moments')) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const promises = registrations.map((reg) => reg.unregister());
    if (promises.length > 0) {
      Promise.all(promises).then(() => {
        // Force a true network fetch — bypass any cache
        window.location.reload(true);
      });
    }
  });
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
