// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: vitest.config.ts
// Purpose: Vitest configuration for all test layers.
// ============================================================

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./src/__tests__/setup.ts'],
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'lcov', 'html'],
      include:    ['src/**/*.{ts,tsx}'],
      exclude:    ['src/**/*.test.{ts,tsx}', 'src/__tests__/**'],
      thresholds: {
        // Minimum coverage gates for release
        functions:  80,
        branches:   75,
        lines:      80,
        statements: 80,
      },
    },
    // Test groups for targeted runs
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    // Separate timeouts per layer
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
