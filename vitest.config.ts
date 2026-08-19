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
        // Entrypoint glue (mounts React app)
        'src/main.tsx',
        'src/App.tsx',
        // Router / app shell
        'src/app/**',
        // React page components (require full rendering + router + context)
        'src/features/**',
        'src/pages/**',
        // UI components (require React rendering)
        'src/components/**',
        // React context providers
        'src/context/**',
        // React Query hooks / module hooks (require QueryClientProvider)
        'src/hooks/**',
        // Supabase client singletons
        'src/lib/supabase.ts',
        'src/lib/supabaseClient.ts',
        // React Query client config
        'src/lib/queryClient.ts',
        // Offline / IndexedDB infrastructure (browser-only, not unit-testable in Node)
        'src/lib/offlineDb.ts',
        'src/lib/localStore.ts',
        'src/lib/encryption.ts',
        // Flat (root-level) service files: the Stage 1-3 offline-first service layer.
        // All depend on lib/localStore (IndexedDB) which is browser-only.
        // Stage 4 services live in subdirectories (src/services/sales/, etc.)
        // and ARE measured via the subdirectory pattern below.
        'src/services/*.ts',
        // Re-export barrel files (no logic)
        'src/engines/index.ts',
        // Seed / mock data files (dev tooling, not production runtime)
        'src/data/**',
        // Pure TypeScript type-only files (interfaces, enums - no executable code)
        'src/types/database.ts',
        'src/types/schema.ts',
        'src/types/contracts.ts',
        'src/types/accounting.ts',
        'src/types/bankReconciliation.ts',
        'src/types/domain.ts',
        'src/types/expenses.ts',
        'src/types/inventory.ts',
        'src/types/invoices.ts',
        'src/types/loyalty.ts',
        'src/types/payroll.ts',
        'src/types/purchasing.ts',
        'src/types/sales.ts',
        'src/types/salesTargets.ts',
        // Vite environment config (reads import.meta.env, not unit-testable)
        'src/config/env.ts',
        // CSS / assets
        'src/styles/**',
        'src/assets/**',
        'src/index.css',
      ],
      thresholds: { functions: 60, lines: 60 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
