import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import 'semantic-ui-css/semantic.min.css'

// Clean up any stale service workers that should not be controlling this page.
// The only valid SW scope is /projects/moments/ — anything else is leftover
// from a previous deployment and must be evicted.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const unregisterPromises = registrations
      .filter((reg) => !reg.scope.includes('/projects/moments/'))
      .map((reg) => reg.unregister());
    if (unregisterPromises.length > 0) {
      Promise.all(unregisterPromises).then(() => {
        // Reload once so the page loads without SW interference
        window.location.reload();
      });
    }
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
