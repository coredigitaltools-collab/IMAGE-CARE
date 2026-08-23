import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // GitHub Pages serves this repo as a project site under /IMAGE-CARE/,
  // not at the domain root. Without an explicit base, Vite emits
  // root-relative asset paths (/assets/...) which 404/503 in production
  // even though `vite preview`/`vite dev` work fine locally.
  base: '/IMAGE-CARE/',
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
