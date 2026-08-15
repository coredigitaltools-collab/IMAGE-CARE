// ============================================================
// ImageCare ERP - Service Index
// File: src/services/index.ts
// Purpose: Single export point for all services.
//          Stage 1: Auth service is active.
//          All other services are architectural stubs
//          ready to be implemented in later build stages.
// ============================================================

// ---- ACTIVE (Stage 1) --------------------------------------
export * from './auth/authService';
export * from '../services/masterData/masterDataService';
export * from '../services/settings/settingsService';

// ---- ARCHITECTURAL STUBS (Stage 4+) -------------------------
// These are defined in the BLD-003 contract and will be implemented
// fully in Build Stage 4: Core Services.
// Importing from these files will work but functions return
// PERMISSION_DENIED until their implementation stage begins.

export const salesService      = { __stage: 4 };
export const purchasingService = { __stage: 4 };
export const inventoryService  = { __stage: 4 };
export const creditService     = { __stage: 4 };
export const expenseService    = { __stage: 4 };
export const payrollService    = { __stage: 4 };
export const cashService       = { __stage: 4 };
export const bankingService    = { __stage: 4 };
export const accountingService = { __stage: 4 };
export const reportingService  = { __stage: 7 };
export const storageService    = { __stage: 4 };
export const auditService      = { __stage: 4 };
export const syncService       = { __stage: 6 };
