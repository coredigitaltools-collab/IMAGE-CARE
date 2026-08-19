import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./src/__tests__/setup.ts'],
    include:     ['src/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include:  ['src/**/*.{ts,tsx}'],
      exclude: [
        // Test files
        'src/__tests__/**',
        // Entrypoint glue - not unit-testable (mounts React app)
        'src/main.tsx',
        'src/App.tsx',
        // Router - not unit-testable without full React + navigation context
        'src/app/**',
        // React UI page components - require full rendering + router + context
        // These are integration/e2e scope, not unit test scope
        'src/features/**',
        'src/components/**',
        // React context providers - require mounted component tree
        'src/context/**',
        // React Query hooks - require QueryClientProvider + component context
        'src/hooks/**',
        // Supabase client singleton - no executable logic, just client init
        'src/lib/supabase.ts',
        // React Query client config - no executable logic
        'src/lib/queryClient.ts',
        // Re-export barrel files - no logic
        'src/services/index.ts',
        'src/engines/index.ts',
        // Pure TypeScript type-only files - no executable code
        'src/types/database.ts',
        'src/types/schema.ts',
        'src/types/contracts.ts',
        'src/vite-env.d.ts',
        // Vite environment config - reads import.meta.env, not unit-testable
        'src/config/env.ts',
      ],
      thresholds: { functions: 60, lines: 60 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
