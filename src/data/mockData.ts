import type { Branch, SyncStatus } from '../types/domain'

// ImageCare's actual branch locations — legitimate real data for this
// specific business (see README "Rebranding" for how a different
// business would replace this), not an industry assumption. Contrast
// with the old contents of this file (removed): fabricated sales/stock
// figures and made-up customer names, which the Dashboard now computes
// for real from the Sales and Inventory modules instead.
export const BRANCHES: Branch[] = [
  { id: 'branch-main', name: 'Kampala Main' },
  { id: 'branch-westlands', name: 'Ntinda' },
  { id: 'branch-industrial', name: 'Industrial Area' },
]

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

// Synchronization is still simulated pending a real connected backend
// (see Settings → Synchronization) — this isn't business-specific, just
// a placeholder for "last successful sync," used regardless of what the
// business sells.
export function mockGetSyncStatus(): SyncStatus {
  return { state: 'synced', lastSyncedAt: minutesAgo(2), pendingCount: 0 }
}
