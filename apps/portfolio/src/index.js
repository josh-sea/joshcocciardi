import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
// Completing a redirect sign-in has to happen on whatever route the browser
// comes back to, not just inside a lazily-loaded tool. Importing this here runs
// its one getRedirectResult() call on every page load.
import { redirectSettled } from './lib/auth';
import reportWebVitals from './reportWebVitals';
import 'semantic-ui-css/semantic.min.css'

// Clean up any stale service workers that should not be controlling this page.
// The only valid SW scope is /projects/moments/ — anything else is leftover
// from a previous deployment and must be evicted.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const stale = registrations.filter((reg) => !reg.scope.includes('/projects/moments/'));
    if (stale.length === 0) return;
    Promise.all(stale.map((reg) => reg.unregister()))
      // Never reload while a returning sign-in is being written to IndexedDB:
      // tearing the page down mid-write loses the credential and lands you back
      // signed out. redirectSettled resolves immediately when there is no
      // redirect in flight, so the ordinary case is unaffected.
      .then(() => redirectSettled)
      .then(() => {
        // Reload once so the page loads without SW interference
        window.location.reload();
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
