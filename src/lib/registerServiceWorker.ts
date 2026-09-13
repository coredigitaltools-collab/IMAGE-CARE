// Registers the pass-through service worker (public/sw.js) that makes the
// app installable as a PWA - see that file's own header comment for why it
// deliberately does no caching. Added 2026-09-12.
//
// `import.meta.env.BASE_URL` (not a hardcoded '/sw.js') matters here: it
// always resolves to whatever `base` is set to in vite.config.mts, so
// this keeps working no matter where the app is deployed - a hardcoded
// path would 404 in production while still appearing to work in local
// dev, exactly like the pre-existing favicon link this same fix
// corrected in index.html. (2026-09-13: `base` moved from
// '/IMAGE-CARE/', the old GitHub Pages project-site subpath, to '/',
// since the app is now served from the root of its own custom domain -
// that old github.io link is retired.)
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
