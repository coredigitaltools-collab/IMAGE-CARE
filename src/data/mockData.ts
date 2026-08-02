import type { SyncStatus } from '../types/domain'

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

// Synchronization is still simulated pending a real connected backend
// (see Settings → Synchronization), this isn't business-specific, just
// a placeholder for "last successful sync," used regardless of what the
// business sells.
export function mockGetSyncStatus(): SyncStatus {
  return { state: 'synced', lastSyncedAt: minutesAgo(2), pendingCount: 0 }
}
