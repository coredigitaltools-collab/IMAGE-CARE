import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { cacheGet, cacheSet } from '../lib/offlineDb'
import {
  mockGetLowStock,
  mockGetRecentSales,
  mockGetSummary,
  mockGetSummaryAllBranches,
  mockGetSyncStatus,
} from '../data/mockData'
import type { DashboardSummary, LowStockItem, RecentSale, SyncStatus } from '../types/domain'

// -----------------------------------------------------------------------
// Dashboard summary service (IMC-002 rule #5: reports come from live
// transactional data, never manually maintained totals). Each function:
//   1. Tries Supabase when configured and the browser is online.
//   2. Falls back to the local IndexedDB cache when offline or on error.
//   3. Falls back to mock data on first run before any cache exists, so
//      the module works standalone before a Supabase project is wired up.
// UI code (hooks/components) never branches on any of this — it only
// calls these functions and reacts to loading/error/data.
// -----------------------------------------------------------------------

async function withOfflineFallback<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  if (isSupabaseConfigured && navigator.onLine) {
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

  // Offline, or Supabase not configured yet.
  const cached = await cacheGet<T>(cacheKey)
  if (cached) return cached.data

  // No cache yet (first run) — synthesize from mock data and seed the cache
  // so subsequent offline loads have something to read.
  const fresh = await fetcher()
  await cacheSet(cacheKey, fresh)
  return fresh
}

export async function getDashboardSummary(branchId: string): Promise<DashboardSummary> {
  return withOfflineFallback(`dashboard-summary:${branchId}`, async () => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.rpc('dashboard_summary', { branch_id: branchId })
      if (error) throw error
      return data as DashboardSummary
    }
    return branchId === 'all' ? mockGetSummaryAllBranches() : mockGetSummary(branchId)
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
    return mockGetLowStock(branchId)
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
    return mockGetRecentSales(branchId).slice(0, 8)
  })
}

export async function getSyncStatus(): Promise<SyncStatus> {
  if (!navigator.onLine) {
    const cached = await cacheGet<SyncStatus>('sync-status')
    return { state: 'offline', lastSyncedAt: cached?.data.lastSyncedAt ?? null, pendingCount: cached?.data.pendingCount ?? 0 }
  }
  const status = isSupabaseConfigured ? mockGetSyncStatus() /* replace with real sync engine status */ : mockGetSyncStatus()
  await cacheSet('sync-status', status)
  return status
}
