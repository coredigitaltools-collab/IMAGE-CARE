// ImageCare service worker (added 2026-09-12, "set the app up as a PWA").
//
// This exists for exactly one reason: Chrome/Edge only offer the "Install
// this page as an app" button (the one the user actually asked for) once a
// site has a valid manifest AND an active service worker. It deliberately
// does NOT cache anything.
//
// Why no caching: ImageCare is a live financial/inventory system backed by
// Supabase - stock levels, prices, credit balances, and sales all change
// constantly. A typical PWA service worker caches the app shell and/or API
// responses for offline use, but doing that here risks a cashier or the
// business owner seeing yesterday's stock count or an old price after a
// real update, with no obvious sign the data is stale. That failure mode is
// worse than "the app doesn't work offline" for a POS/inventory tool, so
// this SW is intentionally a pure pass-through: every request still goes
// straight to the real network, exactly as if no service worker were
// installed at all. If real offline support is ever wanted, that is a
// separate, deliberate feature decision (what's safe to cache, for how
// long, how staleness is shown to the user) - not something to fold into
// "make the app installable" by accident.
self.addEventListener('install', () => {
  // Activate this SW immediately instead of waiting for all tabs of the
  // old one to close - there is no "old cached version" here to protect
  // anyone from, so there's no reason to delay.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pure network pass-through, no cache read/write. Present only to
  // satisfy the browser's installability check.
  event.respondWith(fetch(event.request));
});
