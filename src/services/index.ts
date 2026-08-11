// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/services/index.ts
// Purpose: Central service exports.
//          Import all services from here, not from individual files.
// ============================================================

// Auth
export * from './auth/authService';

// Business Engine
export * from './business/businessEngine';

// Reporting
export * from './reporting/reportingService';

// Sync
export * from './sync/syncService';

// Note: inventory, accounting, storage services follow the same
// pattern and are implemented in subsequent BLD packs.
