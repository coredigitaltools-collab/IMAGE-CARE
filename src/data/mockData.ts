import type { Branch, DashboardSummary, LowStockItem, RecentSale, SyncStatus } from '../types/domain'
import { convertFromUgx, type SupportedCurrency } from '../lib/currency'

export const BRANCHES: Branch[] = [
  { id: 'branch-main', name: 'Kampala Main' },
  { id: 'branch-westlands', name: 'Ntinda' },
  { id: 'branch-industrial', name: 'Industrial Area' },
]

// All figures below are stored in UGX — ImageCare's ledger/functional
// currency (see src/lib/currency.ts). The Dashboard converts to the
// user's selected reporting currency for display only.
const SUMMARY_BY_BRANCH: Record<string, { todaysSalesUgx: number; todaysExpensesUgx: number; cashAvailableUgx: number }> = {
  'branch-main': { todaysSalesUgx: 4_820_300, todaysExpensesUgx: 965_000, cashAvailableUgx: 12_408_000 },
  'branch-westlands': { todaysSalesUgx: 2_156_000, todaysExpensesUgx: 412_000, cashAvailableUgx: 6_104_000 },
  'branch-industrial': { todaysSalesUgx: 0, todaysExpensesUgx: 120_000, cashAvailableUgx: 889_000 },
}

const LOW_STOCK_BY_BRANCH: Record<string, LowStockItem[]> = {
  'branch-main': [
    { id: 'sku-1042', name: 'A4 Photo Paper (Glossy, 230gsm)', quantityRemaining: 6, reorderLevel: 20, branchId: 'branch-main' },
    { id: 'sku-2071', name: 'Canon 045 Toner Cartridge', quantityRemaining: 2, reorderLevel: 10, branchId: 'branch-main' },
    { id: 'sku-3310', name: 'Passport Photo Backdrop Roll', quantityRemaining: 1, reorderLevel: 5, branchId: 'branch-main' },
  ],
  'branch-westlands': [
    { id: 'sku-2071', name: 'Canon 045 Toner Cartridge', quantityRemaining: 4, reorderLevel: 10, branchId: 'branch-westlands' },
  ],
  'branch-industrial': [],
}

// Recent sales keep whatever currency the customer actually paid in —
// this is independent of the reporting-currency selector above, and is
// realistic for a business with foreign/diaspora customers.
const RECENT_SALES_BY_BRANCH: Record<string, RecentSale[]> = {
  'branch-main': [
    { id: 'sale-9001', reference: 'INV-10231', customerName: 'Grace Nakato', amount: 185_000, currency: 'UGX', status: 'completed', createdAt: minutesAgo(12), branchId: 'branch-main' },
    { id: 'sale-9000', reference: 'INV-10230', customerName: 'Walk-in Customer', amount: 32_000, currency: 'UGX', status: 'completed', branchId: 'branch-main', createdAt: minutesAgo(41) },
    { id: 'sale-8999', reference: 'INV-10229', customerName: 'Daniel Okello', amount: 640_000, currency: 'UGX', status: 'pending', branchId: 'branch-main', createdAt: minutesAgo(95) },
    { id: 'sale-8998', reference: 'INV-10228', customerName: 'Sarah Miller (diaspora order)', amount: 25, currency: 'USD', status: 'completed', branchId: 'branch-main', createdAt: minutesAgo(150) },
    { id: 'sale-8997', reference: 'INV-10227', customerName: 'Peter Ssekandi', amount: 21_000, currency: 'UGX', status: 'refunded', branchId: 'branch-main', createdAt: minutesAgo(210) },
  ],
  'branch-westlands': [
    { id: 'sale-7001', reference: 'INV-5510', customerName: 'Susan Namuli', amount: 124_000, currency: 'UGX', status: 'completed', branchId: 'branch-westlands', createdAt: minutesAgo(30) },
    { id: 'sale-7000', reference: 'INV-5509', customerName: 'Cross-border client', amount: 4_800, currency: 'KES', status: 'completed', branchId: 'branch-westlands', createdAt: minutesAgo(75) },
  ],
  'branch-industrial': [],
}

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

function toSummary(
  branchId: string,
  ugx: { todaysSalesUgx: number; todaysExpensesUgx: number; cashAvailableUgx: number },
  reportingCurrency: SupportedCurrency,
): DashboardSummary {
  return {
    branchId,
    todaysSales: convertFromUgx(ugx.todaysSalesUgx, reportingCurrency),
    todaysExpenses: convertFromUgx(ugx.todaysExpensesUgx, reportingCurrency),
    cashAvailable: convertFromUgx(ugx.cashAvailableUgx, reportingCurrency),
    currency: reportingCurrency,
    asOf: new Date().toISOString(),
  }
}

export function mockGetSummary(branchId: string, reportingCurrency: SupportedCurrency): DashboardSummary {
  const base = SUMMARY_BY_BRANCH[branchId]
  if (!base) {
    return toSummary(branchId, { todaysSalesUgx: 0, todaysExpensesUgx: 0, cashAvailableUgx: 0 }, reportingCurrency)
  }
  return toSummary(branchId, base, reportingCurrency)
}

export function mockGetSummaryAllBranches(reportingCurrency: SupportedCurrency): DashboardSummary {
  const totals = Object.values(SUMMARY_BY_BRANCH).reduce(
    (acc, b) => ({
      todaysSalesUgx: acc.todaysSalesUgx + b.todaysSalesUgx,
      todaysExpensesUgx: acc.todaysExpensesUgx + b.todaysExpensesUgx,
      cashAvailableUgx: acc.cashAvailableUgx + b.cashAvailableUgx,
    }),
    { todaysSalesUgx: 0, todaysExpensesUgx: 0, cashAvailableUgx: 0 },
  )
  return toSummary('all', totals, reportingCurrency)
}

export function mockGetLowStock(branchId: string): LowStockItem[] {
  if (branchId === 'all') return Object.values(LOW_STOCK_BY_BRANCH).flat()
  return LOW_STOCK_BY_BRANCH[branchId] ?? []
}

export function mockGetRecentSales(branchId: string): RecentSale[] {
  const sales = branchId === 'all' ? Object.values(RECENT_SALES_BY_BRANCH).flat() : RECENT_SALES_BY_BRANCH[branchId] ?? []
  return [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function mockGetSyncStatus(): SyncStatus {
  return { state: 'synced', lastSyncedAt: minutesAgo(2), pendingCount: 0 }
}
