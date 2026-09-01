import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AppProvider } from './context/AppContext';
import App from './App';
import './styles/globals.css';
// Tailwind v4 design system (ink-*/brand-blue-*/brand-red-* tokens,
// rounded-card/shadow-card utilities) that most feature pages already
// use via className - see vite.config.ts for the matching plugin. This
// was never imported anywhere, so every Tailwind utility class in the
// app compiled to nothing and rendered as unstyled default HTML.
import './index.css';

// 2026-09-01: safety net alongside RouteErrorBoundary (see that file for
// the full story) - Vite fires this event on `window` whenever a
// dynamically-imported chunk fails to load, which is exactly what happens
// when a browser tab is left open across a redeploy and then tries to
// fetch an old page's chunk by a filename hash that no longer exists on
// the server. A reload almost always fixes it (it re-fetches the current
// index.html with the current chunk hashes), so do that once instead of
// leaving the tab on a dead page. `event.preventDefault()` stops this
// from also surfacing as an unhandled rejection in the console/monitoring
// on top of the reload already handling it.
const RELOAD_GUARD_KEY = 'imc_last_auto_reload_at';
const RELOAD_GUARD_WINDOW_MS = 15000; // don't auto-reload more than once per 15s - avoids a loop if reloading genuinely doesn't help (e.g. offline)

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  let lastReload = 0;
  try {
    lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  } catch {
    // sessionStorage unavailable (e.g. private mode) - reload anyway once.
  }
  if (Date.now() - lastReload > RELOAD_GUARD_WINDOW_MS) {
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // ignore - worst case this reloads more than once
    }
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <App />
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
