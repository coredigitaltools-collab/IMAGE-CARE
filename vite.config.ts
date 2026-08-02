import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
//
// ============================================================================
// REBRANDING FOR A DIFFERENT BUSINESS
// The app's displayed business name (sidebar, Dashboard, Settings, About)
// already updates live from Settings → Business Profile, no code change
// needed for that. A small handful of values below are baked in at BUILD
// TIME instead (the installed PWA's name/icon, and the GitHub Pages URL),
// because they have to exist before any user data loads. To rebrand this
// template for a different business, this file plus index.html and the
// files in public/icons/ are the only things to edit by hand. Everything
// else in src/ is already business-name-agnostic.
// ============================================================================
//
// GitHub Pages serves a project repo at https://USERNAME.github.io/REPO-NAME/,
// not from the domain root, base must match your repo name exactly,
// including capitalization. This is set for the "IMAGE-CARE" repo.
export default defineConfig({
  base: '/IMAGE-CARE/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        // Shown as the installed app's name/home-screen label, rename
        // these two (and regenerate public/icons/* + favicon.*) for a
        // different business. See public/icons/README-if-any or just
        // regenerate with any square logo.
        name: 'ImageCare Business Management System',
        short_name: 'ImageCare',
        description:
          'Offline-first business management for inventory, sales, finance, reporting, customers, payroll and branch management.',
        theme_color: '#14336B',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-api-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
