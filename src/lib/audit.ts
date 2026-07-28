// Every entity in ImageCare's data model carries the audit fields IMC-005
// §4 requires. These helpers stamp them consistently so no service has to
// remember the full list by hand.

export type SyncStatus = 'synced' | 'pending' | 'error'

export interface AuditFields {
  id: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  branch_id: string | null
  is_active: boolean
  sync_status: SyncStatus
  last_synced_at: string | null
}

export function newId(): string {
  // crypto.randomUUID is available in all evergreen browsers this PWA targets.
  return crypto.randomUUID()
}

export function stampNew(userId: string, branchId: string | null = null): AuditFields {
  const now = new Date().toISOString()
  return {
    id: newId(),
    created_at: now,
    updated_at: now,
    created_by: userId,
    updated_by: userId,
    branch_id: branchId,
    is_active: true,
    // Nothing has round-tripped to a live backend yet — every new local
    // record starts as a pending offline change (IMC-002 §8, IMC-005 §6).
    sync_status: 'pending',
    last_synced_at: null,
  }
}

export function stampUpdated<T extends AuditFields>(record: T, userId: string): T {
  return {
    ...record,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    sync_status: 'pending',
  }
}

export function markSynced<T extends AuditFields>(record: T): T {
  const now = new Date().toISOString()
  return { ...record, sync_status: 'synced', last_synced_at: now }
}
