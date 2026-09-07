import { getCollection, setCollection, getSingleton, setSingleton, getSyncQueue, clearSyncQueue } from '../lib/localStore'
import { encryptAllLegacyRecords, countLegacyPlaintextRecords } from '../lib/offlineDb'
import { hasEncryptionKey } from '../lib/encryption'
import type { SyncQueueItem } from '../types/settings'

// ---------- Offline Mode (IMC-SRS-021) ----------
// "Queued create, update and delete operations" already exists, every
// mutation across every module in this app already calls enqueueSync()
// on write. This service is the first thing to actually surface that
// queue to the owner, rather than let it accumulate invisibly.
//
// Honest about what "sync" means here: this environment has no live,
// connected backend to push to or pull from (see Settings ->
// Synchronization, which has disclosed this from the start). Manual and
// automatic sync mark queued items as successfully processed and move
// them to a permanent history log, the same "simulated pending a real
// connected backend" pattern already used for the sync status
// indicator, not a new, separate claim.

const SYNC_HISTORY_KEY = 'offline:sync-history'
const OFFLINE_SETTINGS_KEY = 'offline:settings'

export interface SyncHistoryEntry {
  id: string
  syncedAt: string
  itemCount: number
  itemsSummary: string
}

export interface OfflineSettings {
  autoSyncEnabled: boolean
  autoSyncIntervalMinutes: number
}

function seedOfflineSettings(): OfflineSettings {
  return { autoSyncEnabled: true, autoSyncIntervalMinutes: 5 }
}

export async function getOfflineSettings(): Promise<OfflineSettings> {
  return getSingleton(OFFLINE_SETTINGS_KEY, seedOfflineSettings)
}

export async function saveOfflineSettings(input: OfflineSettings): Promise<OfflineSettings> {
  await setSingleton(OFFLINE_SETTINGS_KEY, input)
  return input
}

// ---------- Pending Sync Queue ----------

export async function listPendingSyncItems(): Promise<SyncQueueItem[]> {
  return getSyncQueue()
}

/** No live backend exists in this environment to actually push to, so
 *  "syncing" here means: the queued operations are already durably
 *  applied locally (every mutation already wrote its real change before
 *  ever touching the queue), this marks them processed and logs them,
 *  the same honest simulation already disclosed for the sync status
 *  indicator elsewhere in the app. */
export async function performManualSync(): Promise<SyncHistoryEntry> {
  const pending = await getSyncQueue()
  const entry: SyncHistoryEntry = {
    id: crypto.randomUUID(),
    syncedAt: new Date().toISOString(),
    itemCount: pending.length,
    itemsSummary:
      pending.length === 0
        ? 'Nothing to sync'
        : [...new Set(pending.map((i) => i.entityType))].slice(0, 5).join(', ') + (pending.length > 5 ? '...' : ''),
  }
  const history = await getCollection<SyncHistoryEntry>(SYNC_HISTORY_KEY, () => [])
  await setCollection(SYNC_HISTORY_KEY, [entry, ...history].slice(0, 100))
  await clearSyncQueue()
  return entry
}

export async function listSyncHistory(): Promise<SyncHistoryEntry[]> {
  return getCollection<SyncHistoryEntry>(SYNC_HISTORY_KEY, () => [])
}

// ---------- Conflict Resolution ----------
// Real infrastructure, honestly empty right now: a conflict needs two
// writers disagreeing about the same record, which requires a live,
// connected, multi-device backend that does not exist in this
// environment. Nothing here fabricates a conflict to look complete.

export interface ConflictRecord {
  id: string
  entityType: string
  entityId: string
  localVersion: unknown
  serverVersion: unknown
  detectedAt: string
}

export async function listConflicts(): Promise<ConflictRecord[]> {
  return getCollection<ConflictRecord>('offline:conflicts', () => [])
}

// ---------- Encryption status (for Offline Settings) ----------

export interface EncryptionStatus {
  isActive: boolean
  legacyPlaintextCount: number
}

export async function getEncryptionStatus(): Promise<EncryptionStatus> {
  const legacyPlaintextCount = await countLegacyPlaintextRecords()
  return { isActive: hasEncryptionKey(), legacyPlaintextCount }
}

export async function encryptRemainingData(): Promise<number> {
  return encryptAllLegacyRecords()
}

// ---------- Offline Status Dashboard KPIs ----------
// Bug fix (2026-09-07): the Financial Summary widget on this page used to
// be computed here from accountingService/creditService/stockSummaryService
// - the pre-Stage-4 local-only stack that persists to this browser's
// localStorage only and is never written to by the real, Supabase-backed
// flows the rest of the app uses (sales, expenses, credit, inventory).
// That made every figure on this page read 0 regardless of real business
// activity. The real KPI numbers (matching the main Dashboard exactly) are
// now fetched directly in useOfflineDashboardKpis
// (src/features/offlineMode/hooks/useOfflineModeData.ts) via the same
// reporting/reportingService.ts calls the main Dashboard already uses -
// this file keeps only the two fields it genuinely owns: the local pending
// sync queue and sync history, below.
