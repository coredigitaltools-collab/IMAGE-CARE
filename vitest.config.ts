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

        // Entrypoint glue
        'src/main.tsx',
        'src/App.tsx',

        // Router / app shell
        'src/app/**',

        // React page components (require full React + router rendering)
        'src/pages/**',
        'src/features/**',

        // UI components (require React rendering + component context)
        'src/components/**',

        // React context providers
        'src/context/**',

        // React Query hooks and module hooks (require QueryClientProvider + component)
        'src/hooks/**',

        // Offline-first / browser-only infrastructure.
        // These depend on IndexedDB (idb library) or Web Crypto API and
        // cannot be executed in a Node.js unit test environment.
        'src/lib/localStore.ts',
        'src/lib/offlineDb.ts',
        'src/lib/encryption.ts',
        'src/lib/supabaseClient.ts',

        // Flat service layer (src/services/*.ts) - these are the Stage 1-3
        // offline-first services. Every one either directly imports localStore
        // or transitively depends on it (through salesService, accountingService
        // etc.). They are browser-only and cannot be unit-tested in Node.js.
        // The Stage 4 services live in subdirectories (services/sales/,
        // services/purchasing/, etc.) and ARE covered by workflowServices.test.ts
        'src/services/accountingService.ts',
        'src/services/annualSummaryService.ts',
        'src/services/backupSyncService.ts',
        'src/services/bankReconciliationService.ts',
        'src/services/billsService.ts',
        'src/services/branchOverviewService.ts',
        'src/services/branchService.ts',
        'src/services/brandService.ts',
        'src/services/businessProfileService.ts',
        'src/services/categoryService.ts',
        'src/services/configSettingsService.ts',
        'src/services/creditService.ts',
        'src/services/customerService.ts',
        'src/services/dailySummaryService.ts',
        'src/services/dashboardService.ts',
        'src/services/expenseService.ts',
        'src/services/index.ts',
        'src/services/inventoryDashboardService.ts',
        'src/services/inventoryReportsService.ts',
        'src/services/invoiceService.ts',
        'src/services/loyaltyService.ts',
        'src/services/monthlySummaryService.ts',
        'src/services/offlineModeService.ts',
        'src/services/payrollService.ts',
        'src/services/permissionsService.ts',
        'src/services/productService.ts',
        'src/services/purchasingService.ts',
        'src/services/roleService.ts',
        'src/services/salesService.ts',
        'src/services/salesTargetsService.ts',
        'src/services/staffService.ts',
        'src/services/stockService.ts',
        'src/services/stockSummaryService.ts',
        'src/services/supplierService.ts',
        'src/services/taxSettingsService.ts',
        'src/services/unitService.ts',

        // Singleton clients (no executable logic, just client initialization)
        'src/lib/supabase.ts',
        'src/lib/queryClient.ts',

        // Re-export barrel files (no logic)
        'src/engines/index.ts',

        // Pure TypeScript type-only files (no executable code)
        'src/types/database.ts',
        'src/types/schema.ts',
        'src/types/contracts.ts',
        'src/vite-env.d.ts',

        // Vite environment config (reads import.meta.env at module load time)
        'src/config/env.ts',

        // Seed / mock data (dev tooling only)
        'src/data/**',

        // Static assets and styles
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
