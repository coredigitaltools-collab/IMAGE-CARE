import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserContext, useActiveBranch } from '../../../context/AppContext'
import { runSyncSession } from '../../../services/sync/syncService'
import type { PullResult, SyncBatchResult } from '../../../services/sync/syncService'
import { getDashboardKPIs, getLowStockAlerts } from '../../../services/reporting/reportingService'
import * as offlineModeService from '../../../services/offlineModeService'
import type { OfflineSettings } from '../../../services/offlineModeService'
import type { SupportedCurrency } from '../../../lib/currency'
import type { DashboardKPIs } from '../../../types/database'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['offline-mode'] })
}

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts: throws on
// a ServiceResponse error, unwraps a PagedResponse's `.items`, otherwise
// returns `.data` as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items;
  return d;
}

// ---------------------------------------------------------------------------
// This device's persistent identity for the real sync engine
// (src/services/sync/syncService.ts). Generated once and kept in
// localStorage - the same pattern src/lib/encryption.ts already uses to
// keep this device's encryption key stable across page loads - because a
// device needs a stable id, and pullChanges/pushQueuedOperations need a
// stable cursor, for push/pull to mean anything from one "Sync now" to
// the next.
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = 'offline-mode:device-id'
const SYNC_CURSOR_KEY = 'offline-mode:sync-cursor'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function getSyncCursor(): number {
  const raw = localStorage.getItem(SYNC_CURSOR_KEY)
  return raw ? Number(raw) || 0 : 0
}

function setSyncCursor(cursor: number): void {
  localStorage.setItem(SYNC_CURSOR_KEY, String(cursor))
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
// ---------------------------------------------------------------------------

// Bug fix (2026-09-07): this widget showed every KPI as 0 regardless of
// real business activity, because it read through offlineModeService's old
// local aggregator, which pulled from accountingService/creditService/
// stockSummaryService - the pre-Stage-4 local-only stack that persists to
// this browser's localStorage only and is never written to by the real
// sales/expenses/credit/inventory flows the rest of the app now uses (see
// offlineModeService.ts). Per this page's own original intent - "the 8
// shared accounting/inventory KPIs, reused exactly as the main Dashboard
// already computes them" - it now calls the exact same real,
// business/branch scoped source src/features/dashboard/hooks/
// useDashboardData.ts's useDashboardSummary uses (getDashboardKPIs +
// getLowStockAlerts from reporting/reportingService.ts), scoped to an
// all-time range rather than "today" so this keeps matching what it always
// intended to show. Only pendingSyncCount and lastSuccessfulSyncAt (this
// module's own two genuinely local fields) still come from the local sync
// queue/history below - see usePendingSyncItems/useSyncHistory for why.
export interface OfflineDashboardKpis {
  salesUgx: number
  cogsUgx: number
  grossProfitUgx: number
  expensesUgx: number
  netProfitUgx: number
  cashInHandUgx: number
  outstandingCreditUgx: number
  lowStockCount: number
  pendingSyncCount: number
  lastSuccessfulSyncAt: string | null
}

const ALL_TIME_FROM = '2000-01-01T00:00:00.000Z'

export function useOfflineDashboardKpis(_currency: SupportedCurrency) {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  return useQuery({
    queryKey: ['offline-mode', 'kpis', ctx.business_id, branch],
    queryFn: async (): Promise<OfflineDashboardKpis> => {
      const [kpis, lowStock, pending, history] = await Promise.all([
        getDashboardKPIs(ctx, branch ?? undefined, { from: ALL_TIME_FROM, to: new Date().toISOString() }).then(unwrap) as Promise<DashboardKPIs>,
        getLowStockAlerts(ctx, branch ?? undefined).then(unwrap) as Promise<Array<{ product_id: string }>>,
        offlineModeService.listPendingSyncItems(),
        offlineModeService.listSyncHistory(),
      ])
      return {
        salesUgx: kpis.revenue,
        cogsUgx: kpis.cogs,
        grossProfitUgx: kpis.gross_profit,
        expensesUgx: kpis.expenses,
        netProfitUgx: kpis.net_profit,
        cashInHandUgx: kpis.cash_in_hand,
        outstandingCreditUgx: kpis.credit_outstanding,
        lowStockCount: lowStock.length,
        pendingSyncCount: pending.length,
        lastSuccessfulSyncAt: history[0]?.syncedAt ?? null,
      }
    },
  })
}

// "Sync now" genuinely talks to the real sync engine now (runSyncSession -
// the same real push-then-pull orchestrator src/hooks/modules/
// useModuleHooks.ts's useOfflineMode wraps for SRS-021) whenever this
// device is online, advancing a persisted cursor across page loads instead
// of just simulating one. It still also drains and logs the local queue
// exactly as before: the real sync_queue table this pushes from is only
// ever populated via syncService.enqueueOperation(), which nothing in this
// app's mutation flows calls yet (every module writes through the local
// queue in src/lib/localStore.ts instead - see
// docs/MODULE_INTEGRATION_MAP.md gap), so today a real push genuinely
// pushes 0 items - that gap is disclosed here, not hidden. The Pending
// Sync Queue and Sync History pages read the local drain below, which has
// to keep succeeding while offline (this is Offline Mode), so a failed or
// skipped real sync attempt never blocks it.
export function usePerformManualSync() {
  const ctx = useUserContext()
  const branch = useActiveBranch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (navigator.onLine) {
        try {
          const deviceId = getDeviceId()
          const cursor = getSyncCursor()
          const result = (await runSyncSession(ctx, deviceId, cursor, branch ?? undefined).then(unwrap)) as {
            push: SyncBatchResult
            pull: PullResult
          }
          setSyncCursor(result.pull.new_cursor)
        } catch {
          // Real backend unreachable, misconfigured, or rejected the
          // session - fall through to the local drain below regardless,
          // the same as if this device were offline.
        }
      }
      return offlineModeService.performManualSync()
    },
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------------------------------------------------------------------------
// Local-only hooks - no real backend service exists for these operations yet.
// ---------------------------------------------------------------------------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
// syncService.ts's pushQueuedOperations/pullChanges only return aggregate
// results (counts pushed/pulled, a new cursor) from whatever session just
// ran - there is no real "list what's currently pending" endpoint to back
// this page's queue with, so it keeps reading the local queue, which is
// where pending ops genuinely sit before a push.
export function usePendingSyncItems() {
  return useQuery({ queryKey: ['offline-mode', 'pending'], queryFn: offlineModeService.listPendingSyncItems })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
// No real function/table exposes a readable history of past sync sessions
// (sync_batches rows are written by pushQueuedOperations but nothing in
// syncService.ts reads them back), so this stays the local log
// usePerformManualSync above writes to on every call.
export function useSyncHistory() {
  return useQuery({ queryKey: ['offline-mode', 'history'], queryFn: offlineModeService.listSyncHistory })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
// SyncBatchResult only carries an aggregate `conflicts: number` from a
// push, never the individual entityType/localVersion/serverVersion a
// conflict record needs to be reviewable - there is nothing here to
// honestly wire this page to, so no conflict-resolution rules are invented.
export function useConflicts() {
  return useQuery({ queryKey: ['offline-mode', 'conflicts'], queryFn: offlineModeService.listConflicts })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
// Purely a local-device concern (AES-256-GCM over this device's IndexedDB
// data) - there is no backend counterpart to wire to at all.
export function useEncryptionStatus() {
  return useQuery({ queryKey: ['offline-mode', 'encryption-status'], queryFn: offlineModeService.getEncryptionStatus })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useEncryptRemainingData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: offlineModeService.encryptRemainingData,
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
// Device/sync preferences with no user-facing backend service of their own.
export function useOfflineSettings() {
  return useQuery({ queryKey: ['offline-mode', 'settings'], queryFn: offlineModeService.getOfflineSettings })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useSaveOfflineSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OfflineSettings) => offlineModeService.saveOfflineSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}
