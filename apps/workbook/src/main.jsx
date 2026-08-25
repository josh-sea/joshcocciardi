import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// If a stale service worker from another app on this domain is serving us at
// the wrong path, unregister everything and reload so the right page loads.
// (Same guard moment-capture uses.)
if ('serviceWorker' in navigator && !window.location.pathname.startsWith('/projects/workbook')) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const promises = registrations.map((reg) => reg.unregister())
    if (promises.length > 0) {
      Promise.all(promises).then(() => window.location.reload(true))
    }
  })
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
