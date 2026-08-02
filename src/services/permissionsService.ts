import { getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { seedPermissionMatrix } from '../data/settingsSeed'
import { listRoles } from './roleService'
import { OWNER_ROLE_ID, PERMISSIONS } from '../types/settings'
import type { Permission, PermissionMatrix, StaffRole } from '../types/settings'

const KEY = 'settings:permission-matrix'

function emptyPermissionRow(): Record<Permission, boolean> {
  return Object.fromEntries(PERMISSIONS.map((p) => [p, false])) as Record<Permission, boolean>
}

/** Self-healing: any role that exists in the role catalogue but doesn't
 *  have a matrix entry yet (because it was added after the matrix was
 *  last saved) gets a safe, all-false starting row here rather than
 *  crashing the Permission Matrix table or silently granting nothing
 *  through a missing lookup. */
export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  const [stored, roles] = await Promise.all([getSingleton(KEY, seedPermissionMatrix), listRoles()])
  let healed = false
  const next: PermissionMatrix = { ...stored }
  for (const role of roles) {
    if (!role.is_active) continue
    if (!next[role.id]) {
      next[role.id] = emptyPermissionRow()
      healed = true
    }
  }
  if (healed) await setSingleton(KEY, next)
  return next
}

export class OwnerPermissionsLockedError extends Error {
  constructor() {
    super('Owner permissions cannot be changed, Owners always have unrestricted access.')
    this.name = 'OwnerPermissionsLockedError'
  }
}

export async function setPermission(
  role: StaffRole,
  permission: Permission,
  granted: boolean,
  _userId: string,
): Promise<PermissionMatrix> {
  if (role === OWNER_ROLE_ID) throw new OwnerPermissionsLockedError()
  const matrix = await getPermissionMatrix()
  const next: PermissionMatrix = {
    ...matrix,
    [role]: { ...matrix[role], [permission]: granted },
  }
  await setSingleton(KEY, next)
  // Permission changes apply immediately (IMP-002 business rule), this
  // record isn't itself an audited entity, but the change is still queued
  // so a connected backend eventually receives it.
  await enqueueSync({ entityType: 'permission_matrix', entityId: role, operation: 'update' })
  return next
}
