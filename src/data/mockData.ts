import type { Branch, DashboardSummary, LowStockItem, RecentSale, SyncStatus } from '../types/domain'

export const BRANCHES: Branch[] = [
  { id: 'branch-main', name: 'Main Branch' },
  { id: 'branch-westlands', name: 'Westlands' },
  { id: 'branch-industrial', name: 'Industrial Area' },
]

const SUMMARY_BY_BRANCH: Record<string, Omit<DashboardSummary, 'branchId' | 'asOf'>> = {
  'branch-main': { todaysSales: 482_300, todaysExpenses: 96_500, cashAvailable: 1_240_800, currency: 'KES' },
  'branch-westlands': { todaysSales: 215_600, todaysExpenses: 41_200, cashAvailable: 610_400, currency: 'KES' },
  'branch-industrial': { todaysSales: 0, todaysExpenses: 12_000, cashAvailable: 88_900, currency: 'KES' },
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

const RECENT_SALES_BY_BRANCH: Record<string, RecentSale[]> = {
  'branch-main': [
    { id: 'sale-9001', reference: 'INV-10231', customerName: 'Grace Mwangi', amount: 18_500, currency: 'KES', status: 'completed', createdAt: minutesAgo(12), branchId: 'branch-main' },
    { id: 'sale-9000', reference: 'INV-10230', customerName: 'Walk-in Customer', amount: 3_200, currency: 'KES', status: 'completed', branchId: 'branch-main', createdAt: minutesAgo(41) },
    { id: 'sale-8999', reference: 'INV-10229', customerName: 'Daniel Otieno', amount: 64_000, currency: 'KES', status: 'pending', branchId: 'branch-main', createdAt: minutesAgo(95) },
    { id: 'sale-8998', reference: 'INV-10228', customerName: 'Fatuma Ali', amount: 9_750, currency: 'KES', status: 'completed', branchId: 'branch-main', createdAt: minutesAgo(150) },
    { id: 'sale-8997', reference: 'INV-10227', customerName: 'Peter Njoroge', amount: 2_100, currency: 'KES', status: 'refunded', branchId: 'branch-main', createdAt: minutesAgo(210) },
  ],
  'branch-westlands': [
    { id: 'sale-7001', reference: 'INV-5510', customerName: 'Susan Kamau', amount: 12_400, currency: 'KES', status: 'completed', branchId: 'branch-westlands', createdAt: minutesAgo(30) },
    { id: 'sale-7000', reference: 'INV-5509', customerName: 'Walk-in Customer', amount: 1_800, currency: 'KES', status: 'completed', branchId: 'branch-westlands', createdAt: minutesAgo(75) },
  ],
  'branch-industrial': [],
}

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

export function mockGetSummary(branchId: string): DashboardSummary {
  const base = SUMMARY_BY_BRANCH[branchId]
  if (!base) {
    return { branchId, todaysSales: 0, todaysExpenses: 0, cashAvailable: 0, currency: 'KES', asOf: new Date().toISOString() }
  }
  return { branchId, ...base, asOf: new Date().toISOString() }
}

export function mockGetSummaryAllBranches(): DashboardSummary {
  const totals = Object.values(SUMMARY_BY_BRANCH).reduce(
    (acc, b) => ({
      todaysSales: acc.todaysSales + b.todaysSales,
      todaysExpenses: acc.todaysExpenses + b.todaysExpenses,
      cashAvailable: acc.cashAvailable + b.cashAvailable,
    }),
    { todaysSales: 0, todaysExpenses: 0, cashAvailable: 0 },
  )
  return { branchId: 'all', ...totals, currency: 'KES', asOf: new Date().toISOString() }
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
