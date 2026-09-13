// Registers the pass-through service worker (public/sw.js) that makes the
// app installable as a PWA - see that file's own header comment for why it
// deliberately does no caching. Added 2026-09-12.
//
// `import.meta.env.BASE_URL` (not a hardcoded '/sw.js') matters here: the
// app is deployed to GitHub Pages under a project subpath
// (`/IMAGE-CARE/`, see vite.config.mts's `base`), so the real, served
// location of this file is `/IMAGE-CARE/sw.js`, not `/sw.js`. Registering
// at the wrong path would 404 in production while still appearing to work
// in local dev (served from `/`), exactly like the pre-existing favicon
// link this same fix corrected in index.html.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Installability is a nice-to-have, not core functionality. Register
  // after the page has fully loaded so it can never compete with or delay
  // anything the app itself needs on first paint, and swallow any failure
  // (unsupported browser, blocked by an extension/policy, dev server
  // quirks) silently - a user should never see an error, and the app must
  // work exactly the same whether or not this succeeds.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
