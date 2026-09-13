import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // Bug fix (2026-09-13): this used to be '/IMAGE-CARE/' for the old
  // coredigitaltools-collab.github.io/IMAGE-CARE/ project-site address.
  // The app is now reached at its own custom domain
  // (imc.coredigitaltools.com), served from that domain's root, not a
  // GitHub Pages project subpath - that old link is retired. With base
  // still set to '/IMAGE-CARE/', every asset URL Vite emits would be
  // prefixed with a path segment that doesn't exist under the custom
  // domain, so the browser 404s on every script/stylesheet and the page
  // renders blank (only the <title> shows, since that's inline HTML,
  // not a fetched asset). '/' matches how the site is actually served
  // now.
  base: '/',
  // src/index.css already uses Tailwind v4's CSS-first config
  // (`@import "tailwindcss"` + an `@theme` block defining the ink-*/
  // brand-blue-*/brand-red-* design tokens), but tailwindcss itself was
  // never installed and this plugin was never wired in - so every
  // Tailwind utility class used across the app (KpiCard, *Tabs.tsx nav,
  // Cash Flow/Loyalty/etc. dashboards, and most pages built after the
  // original globals.css design system) compiled to literally nothing.
  // See src/main.tsx for the matching stylesheet import.
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query:    ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
