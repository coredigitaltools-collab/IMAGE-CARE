import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { cacheGet, cacheSet } from '../lib/offlineDb'
import { mockGetSyncStatus } from '../data/mockData'
import { listSales } from './salesService'
import { listCustomers } from './customerService'
import { getLowStockReport } from './inventoryReportsService'
import { getCashInHandBreakdown } from './accountingService'
import { listExpenses } from './expenseService'
import { getCreditDashboardKpis } from './creditService'
import { convertFromUgx, type SupportedCurrency } from '../lib/currency'
import type { DashboardSummary, LowStockItem, RecentSale, SyncStatus } from '../types/domain'

// -----------------------------------------------------------------------
// Dashboard summary service (IMC-002 rule #5: reports come from live
// transactional data, never manually maintained totals). Each function:
//   1. Tries Supabase when configured and the browser is online.
//   2. Falls back to the local IndexedDB cache when offline or on error.
//   3. Falls back to REAL local computation (from Sales + Inventory —
//      the same data those modules show) when Supabase isn't configured,
//      never a business-specific mock dataset. A fresh install's
//      Dashboard is therefore genuinely empty until real sales/products
//      exist, matching every other module's empty states.
// UI code (hooks/components) never branches on any of this — it only
// calls these functions and reacts to loading/error/data.
// -----------------------------------------------------------------------

async function withOfflineFallback<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  if (!navigator.onLine) {
    // Genuinely offline — serve the last known good snapshot if we have
    // one, otherwise attempt a local computation anyway (real local data
    // works fine offline; only Supabase calls would actually fail here).
    const cached = await cacheGet<T>(cacheKey)
    if (cached) return cached.data
    const fresh = await fetcher()
    await cacheSet(cacheKey, fresh)
    return fresh
  }

  // Online: always recompute fresh — whether that means a Supabase call
  // or a local read from Sales/Inventory, both are fast and change over
  // time (new sales, new stock), so the cache must never be treated as
  // "good enough" just because it exists. It's a fallback for errors
  // only, not a first-choice cache.
  try {
    const fresh = await fetcher()
    await cacheSet(cacheKey, fresh)
    return fresh
  } catch (err) {
    const cached = await cacheGet<T>(cacheKey)
    if (cached) return cached.data
    throw err
  }
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export async function getDashboardSummary(branchId: string, reportingCurrency: SupportedCurrency): Promise<DashboardSummary> {
  return withOfflineFallback(`dashboard-summary:${branchId}:${reportingCurrency}`, async () => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc('dashboard_summary', {
        branch_id: branchId,
        reporting_currency: reportingCurrency,
      })
      if (error) throw error
      return data as DashboardSummary
    }

    const sales = await listSales()
    const scoped = branchId === 'all' ? sales : sales.filter((s) => s.branchId === branchId)
    const completed = scoped.filter((s) => s.status === 'completed')
    const todaysCompleted = completed.filter((s) => isToday(s.createdAt))

    // "Sales = Sum(Selling Price × Quantity Sold), COGS = Sum(Buying
    // Price × Quantity Sold), Gross Profit = Sales − COGS" — computed
    // here from the branch-scoped set so the KPI respects the selected
    // branch; Cash in Hand and outstanding credit are business-wide
    // (one till, one accounting engine), not tracked per branch.
    const todaysSalesUgx = todaysCompleted.reduce((sum, s) => sum + s.totalAmount, 0)
    const todaysCogsUgx = todaysCompleted.reduce((sum, s) => sum + s.items.reduce((lineSum, i) => lineSum + (i.unitCost ?? 0) * i.quantity, 0), 0)
    const grossProfitUgx = todaysSalesUgx - todaysCogsUgx

    const [cashBreakdown, allExpenses, creditKpis] = await Promise.all([
      getCashInHandBreakdown(),
      listExpenses(),
      getCreditDashboardKpis(),
    ])
    const todaysExpensesUgx = allExpenses
      .filter((e) => e.status === 'paid' && isToday(e.paidAt ?? e.expenseDate))
      .reduce((sum, e) => sum + e.amount, 0)
    // Net Profit = Gross Profit − Operating Expenses (IMC Accounting
    // Engine Correction). Never subtract COGS again here — it's already
    // inside Gross Profit above.
    const netProfitUgx = grossProfitUgx - todaysExpensesUgx

    return {
      branchId,
      todaysSales: convertFromUgx(todaysSalesUgx, reportingCurrency),
      todaysCogs: convertFromUgx(todaysCogsUgx, reportingCurrency),
      grossProfit: convertFromUgx(grossProfitUgx, reportingCurrency),
      todaysExpenses: convertFromUgx(todaysExpensesUgx, reportingCurrency),
      netProfit: convertFromUgx(netProfitUgx, reportingCurrency),
      cashInHand: convertFromUgx(cashBreakdown.cashInHandUgx, reportingCurrency),
      outstandingCredit: convertFromUgx(creditKpis.totalOutstandingUgx, reportingCurrency),
      currency: reportingCurrency,
      asOf: new Date().toISOString(),
    }
  })
}

export async function getLowStockItems(branchId: string): Promise<LowStockItem[]> {
  return withOfflineFallback(`low-stock:${branchId}`, async () => {
    if (isSupabaseConfigured && supabase) {
      const query = supabase.from('inventory_items').select('*').lte('quantity_remaining', 'reorder_level')
      const { data, error } = branchId === 'all' ? await query : await query.eq('branch_id', branchId)
      if (error) throw error
      return data as LowStockItem[]
    }

    const lowStock = await getLowStockReport()
    const scoped = branchId === 'all' ? lowStock : lowStock.filter((p) => p.branch_id === branchId)
    return scoped.map((p) => ({
      id: p.id,
      name: p.name,
      quantityRemaining: p.currentStock,
      reorderLevel: p.reorderLevel,
      branchId: p.branch_id ?? 'all',
    }))
  })
}

export async function getRecentSales(branchId: string): Promise<RecentSale[]> {
  return withOfflineFallback(`recent-sales:${branchId}`, async () => {
    if (isSupabaseConfigured && supabase) {
      const query = supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(8)
      const { data, error } = branchId === 'all' ? await query : await query.eq('branch_id', branchId)
      if (error) throw error
      return data as RecentSale[]
    }

    const [sales, customers] = await Promise.all([listSales(), listCustomers()])
    const scoped = branchId === 'all' ? sales : sales.filter((s) => s.branchId === branchId)
    return scoped.slice(0, 8).map((s) => ({
      id: s.id,
      reference: s.reference,
      customerName: s.customerId ? (customers.find((c) => c.id === s.customerId)?.name ?? 'Customer') : 'Walk-in Customer',
      amount: s.totalAmount,
      currency: 'UGX',
      status: s.status === 'completed' ? 'completed' : s.status === 'refunded' ? 'refunded' : 'pending',
      createdAt: s.createdAt,
      branchId: s.branchId ?? 'all',
    }))
  })
}

export async function getSyncStatus(): Promise<SyncStatus> {
  if (!navigator.onLine) {
    const cached = await cacheGet<SyncStatus>('sync-status')
    return { state: 'offline', lastSyncedAt: cached?.data.lastSyncedAt ?? null, pendingCount: cached?.data.pendingCount ?? 0 }
  }
  const status = mockGetSyncStatus() // placeholder pending a real sync engine — see Settings → Synchronization
  await cacheSet('sync-status', status)
  return status
}
