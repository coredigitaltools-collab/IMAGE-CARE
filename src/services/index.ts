// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/index.ts
// Purpose: Complete service index.
//          Import ALL services from this file.
//          Never import directly from individual service files in pages.
//
// Usage:
//   import { createSale, listProducts, getDashboardKPIs } from '@/services';
// ============================================================

// ---- Auth --------------------------------------------------
export {
  login,
  logout,
  getActiveSession,
  refreshSession,
  loadUserContext,
  onAuthStateChange,
} from './auth/authService';

// ---- Business Engine (internal - use named services below) -
export {
  createAndPostSale,
  createAndPostPurchase,
  createAndPostExpense,
  processCreditRepayment,
  processPayroll,
} from './business/businessEngine';

// ---- Sales -------------------------------------------------
export {
  createSale,
  getSale,
  listSales,
  cancelSale,
  getSaleReceipt,
} from './sales/salesService';

// ---- Purchasing --------------------------------------------
export {
  createPurchase,
  getPurchase,
  listPurchases,
  recordSupplierPayment,
} from './purchasing/purchasingService';

// ---- Inventory ---------------------------------------------
export {
  getStock,
  listInventory,
  getInventoryMovements,
  createStockAdjustment,
  createStockTransfer,
  receiveStockTransfer,
} from './inventory/inventoryService';

// ---- Credit ------------------------------------------------
export {
  getCustomerCredit,
  getOutstandingCredit,
  recordCreditPayment,
} from './credit/creditService';

// ---- Invoices ----------------------------------------------
export {
  getInvoice,
  listInvoices,
  recordInvoicePayment,
} from './credit/creditService';

// ---- Payables (Bills) --------------------------------------
export {
  getBill,
  listBills,
} from './credit/creditService';

// ---- Expenses ----------------------------------------------
export {
  createExpense,
  listExpenses,
} from './financial/financialServices';

// ---- Payroll -----------------------------------------------
export {
  getPayroll,
  listPayroll,
  approvePayroll,
  processPayrollPayment,
} from './financial/financialServices';

// ---- Cash --------------------------------------------------
export {
  getCashBalance,
  listCashTransactions,
} from './financial/financialServices';

// ---- Accounting --------------------------------------------
export {
  listJournalEntries,
  getAccountBalance,
} from './financial/financialServices';

// ---- Audit -------------------------------------------------
export {
  listAuditLogs,
} from './financial/financialServices';

// ---- Master Data -------------------------------------------
export {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  softDeleteProduct,
  listCategories,
  listUnits,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  listSuppliers,
  getSupplier,
  createSupplier,
} from './masterData/masterDataService';

// ---- Settings ----------------------------------------------
export {
  getSetting,
  getSettingsByCategory,
  updateSetting,
  getChartOfAccounts,
  getBusinessCurrency,
  getVatRate,
  allowNegativeStock,
  getReceiptPrefix,
} from './settings/settingsService';

// ---- Reporting ---------------------------------------------
export {
  getDashboardKPIs,
  getSalesByPeriod,
  getTopProducts,
  getStockSummary,
  getCashPosition,
  getOutstandingCredit as getOutstandingCreditSummary,
  getExpenseBreakdown,
} from './reporting/reportingService';

// ---- Storage -----------------------------------------------
export {
  uploadFile,
  getSignedFileUrl,
  deleteFile,
  listFiles,
} from './storage/storageService';

// ---- Sync --------------------------------------------------
export {
  registerDevice,
  getInitialSyncPayload,
  pullChanges,
  pushQueuedOperations,
  enqueueOperation,
  runSyncSession,
} from './sync/syncService';
