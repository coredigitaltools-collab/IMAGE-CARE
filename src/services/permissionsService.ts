import { getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { seedPermissionMatrix } from '../data/settingsSeed'
import type { Permission, PermissionMatrix, StaffRole } from '../types/settings'

const KEY = 'settings:permission-matrix'

export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  return getSingleton(KEY, seedPermissionMatrix)
}

export class OwnerPermissionsLockedError extends Error {
  constructor() {
    super('Owner permissions cannot be changed — Owners always have unrestricted access.')
    this.name = 'OwnerPermissionsLockedError'
  }
}

export async function setPermission(
  role: StaffRole,
  permission: Permission,
  granted: boolean,
  _userId: string,
): Promise<PermissionMatrix> {
  if (role === 'owner') throw new OwnerPermissionsLockedError()
  const matrix = await getPermissionMatrix()
  const next: PermissionMatrix = {
    ...matrix,
    [role]: { ...matrix[role], [permission]: granted },
  }
  await setSingleton(KEY, next)
  // Permission changes apply immediately (IMP-002 business rule) — this
  // record isn't itself an audited entity, but the change is still queued
  // so a connected backend eventually receives it.
  await enqueueSync({ entityType: 'permission_matrix', entityId: role, operation: 'update' })
  return next
}
