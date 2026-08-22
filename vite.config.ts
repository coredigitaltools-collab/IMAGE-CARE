import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // GitHub Pages serves this repo as a project site under /IMAGE-CARE/,
  // not at the domain root. Without an explicit base, Vite emits
  // root-relative asset paths (/assets/...) which 404/503 in production
  // even though `vite preview`/`vite dev` work fine locally.
  base: '/IMAGE-CARE/',
  plugins: [react()],
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
