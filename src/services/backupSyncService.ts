import { cacheGet, cacheSet } from '../lib/offlineDb'
import { getSyncQueue, clearSyncQueue } from '../lib/localStore'
import type { BackupRecord, SyncQueueItem } from '../types/settings'

// Every key this backup covers, kept in one place so export/import and
// future new settings sections stay in sync with each other.
const BACKUP_KEYS = [
  'settings:business-profile',
  'settings:branches',
  'settings:staff',
  'settings:permission-matrix',
  'settings:tax-rates',
  'settings:receipts',
  'settings:inventory-config',
  'settings:sales-config',
  'settings:notifications',
  'settings:appearance',
]

const BACKUP_HISTORY_KEY = 'settings:backup-history'
const LAST_SYNCED_KEY = 'settings:last-synced-at'

interface BackupFile {
  createdAt: string
  version: 1
  data: Record<string, unknown>
}

export async function createBackup(userId: string): Promise<{ file: BackupFile; record: BackupRecord }> {
  const data: Record<string, unknown> = {}
  for (const key of BACKUP_KEYS) {
    const cached = await cacheGet<unknown>(key)
    if (cached) data[key] = cached.data
  }
  const file: BackupFile = { createdAt: new Date().toISOString(), version: 1, data }
  const json = JSON.stringify(file, null, 2)

  const record: BackupRecord = {
    id: crypto.randomUUID(),
    createdAt: file.createdAt,
    createdBy: userId,
    sizeBytes: new Blob([json]).size,
  }
  const history = await getBackupHistory()
  await cacheSet(BACKUP_HISTORY_KEY, [record, ...history].slice(0, 20))

  return { file, record }
}

export function downloadBackupFile(file: { createdAt: string; version: 1; data: Record<string, unknown> }) {
  const json = JSON.stringify(file, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `business-backup-${file.createdAt.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export class InvalidBackupFileError extends Error {
  constructor() {
    super('This file is not a valid backup for this app.')
    this.name = 'InvalidBackupFileError'
  }
}

export async function restoreBackup(fileContents: string): Promise<void> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(fileContents)
  } catch {
    throw new InvalidBackupFileError()
  }
  if (!parsed || parsed.version !== 1 || typeof parsed.data !== 'object') {
    throw new InvalidBackupFileError()
  }
  for (const key of BACKUP_KEYS) {
    if (key in parsed.data) {
      await cacheSet(key, parsed.data[key])
    }
  }
}

export async function getBackupHistory(): Promise<BackupRecord[]> {
  const cached = await cacheGet<BackupRecord[]>(BACKUP_HISTORY_KEY)
  return cached?.data ?? []
}

// ---------- Synchronization ----------

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return getSyncQueue()
}

export async function getLastSyncedAt(): Promise<string | null> {
  const cached = await cacheGet<string>(LAST_SYNCED_KEY)
  return cached?.data ?? null
}

/** Simulates pushing every queued offline change to the backend and
 *  clearing the queue. There's no live Supabase project connected yet
 *  (see lib/supabaseClient.ts), swap this for a real push loop once
 *  there is one; the queue shape (entityType/entityId/operation) is
 *  already what a real sync engine would need. */
export async function runSync(): Promise<{ syncedCount: number }> {
  const queue = await getSyncQueue()
  await clearSyncQueue()
  const now = new Date().toISOString()
  await cacheSet(LAST_SYNCED_KEY, now)
  return { syncedCount: queue.length }
}
