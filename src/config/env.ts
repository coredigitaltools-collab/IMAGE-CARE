// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/config/env.ts
// Purpose: Environment configuration.
//          All env vars go through this file.
//          Never read import.meta.env directly outside this file.
// ============================================================

export const env = {
  supabase: {
    url:     import.meta.env.VITE_SUPABASE_URL     as string,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  },
  app: {
    name:        'ImageCare ERP',
    version:     import.meta.env.VITE_APP_VERSION as string ?? '1.0.0',
    environment: import.meta.env.MODE as 'development' | 'production' | 'test',
    isDev:       import.meta.env.DEV as boolean,
    isProd:      import.meta.env.PROD as boolean,
  },
  storage: {
    bucketAssets:    'imagecare-assets',
    bucketDocuments: 'imagecare-documents',
    bucketExports:   'imagecare-exports',
    bucketPayroll:   'imagecare-payroll',
  },
} as const;

// ---- Application constants ---------------------------------

export const APP_CONSTANTS = {
  // Pagination defaults
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
  EXPORT_PAGE_SIZE: 5000,

  // Sync
  SYNC_BATCH_SIZE: 50,
  SYNC_PULL_BATCH_SIZE: 200,
  SYNC_MAX_RETRIES: 5,
  SYNC_CHANGE_LOG_RETENTION_DAYS: 30,

  // Auth
  SESSION_EXPIRES_HOURS: 24,
  OFFLINE_CACHE_EXPIRES_HOURS: 168, // 7 days
  RATE_LIMIT_MAX_ATTEMPTS: 5,
  RATE_LIMIT_WINDOW_MINUTES: 15,
  RATE_LIMIT_LOCKOUT_MINUTES: 30,

  // Finance
  CURRENCY_DECIMAL_PLACES: 0,   // UGX has no decimal places
  AMOUNT_TOLERANCE: 0.01,        // max acceptable rounding difference

  // File uploads
  MAX_IMAGE_SIZE_MB: 5,
  MAX_DOCUMENT_SIZE_MB: 10,
  MAX_EXPORT_SIZE_MB: 50,

  // UI
  DEBOUNCE_SEARCH_MS: 300,
  TOAST_DURATION_MS: 4000,
  TABLE_ROW_HEIGHT_PX: 48,
} as const;

// ---- Module names (must match imagecare.group_permissions.module) ---

export const MODULES = {
  SALES:      'sales',
  PURCHASES:  'purchases',
  EXPENSES:   'expenses',
  PAYROLL:    'payroll',
  INVENTORY:  'inventory',
  CUSTOMERS:  'customers',
  SUPPLIERS:  'suppliers',
  REPORTS:    'reports',
  SETTINGS:   'settings',
  USERS:      'users',
  BRANCHES:   'branches',
  JOURNAL:    'journal',
  BANK:       'bank',
  CASH:       'cash',
  CREDIT:     'credit',
  INVOICES:   'invoices',
  BILLS:      'bills',
  // Restored from the pre-reset 20-module frontend (see
  // docs/MODULE_INTEGRATION_MAP.md SRS-008, SRS-013, SRS-014, SRS-016,
  // SRS-017, SRS-018, SRS-020, SRS-021). These module keys did not exist
  // before this pass - a business owner must be granted an explicit
  // user_permissions row for each before the corresponding sidebar item
  // becomes visible to them (module view access is never inferred from
  // is_owner, per usePermission.ts).
  LOYALTY:          'loyalty',
  SALES_TARGETS:    'salesTargets',
  STOCK_SUMMARY:    'stockSummary',
  DAILY_SUMMARY:    'dailySummary',
  MONTHLY_SUMMARY:  'monthlySummary',
  ANNUAL_SUMMARY:   'annualSummary',
  BRANCH_OVERVIEW:  'branchOverview',
  OFFLINE_MODE:     'offlineMode',
  ACCOUNTING:       'accounting',
} as const;

export type ModuleName = typeof MODULES[keyof typeof MODULES];
