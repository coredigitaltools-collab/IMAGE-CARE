import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedRoles } from '../data/settingsSeed'
import { OWNER_ROLE_ID } from '../types/settings'
import type { RoleDefinition, RoleDefinitionInput } from '../types/settings'

const KEY = 'settings:roles'

export class OwnerRoleProtectedError extends Error {
  constructor() {
    super('The Owner role is protected and cannot be changed or removed.')
    this.name = 'OwnerRoleProtectedError'
  }
}
export class RoleInUseError extends Error {
  constructor(count: number) {
    super(`This role is assigned to ${count} staff member${count === 1 ? '' : 's'}, reassign them first.`)
    this.name = 'RoleInUseError'
  }
}
export class DuplicateRoleNameError extends Error {
  constructor() {
    super('A role with this name already exists.')
    this.name = 'DuplicateRoleNameError'
  }
}

export async function listRoles(): Promise<RoleDefinition[]> {
  return getCollection<RoleDefinition>(KEY, seedRoles)
}

export async function createRole(input: RoleDefinitionInput, userId: string): Promise<RoleDefinition> {
  const name = input.name.trim()
  if (!name) throw new Error('Role name is required.')
  const roles = await listRoles()
  if (roles.some((r) => r.is_active && r.name.toLowerCase() === name.toLowerCase())) {
    throw new DuplicateRoleNameError()
  }
  const role: RoleDefinition = { ...stampNew(userId), name }
  await setCollection(KEY, [...roles, role])
  await enqueueSync({ entityType: 'role', entityId: role.id, operation: 'create' })
  return role
}

export async function renameRole(id: string, name: string, userId: string): Promise<RoleDefinition> {
  if (id === OWNER_ROLE_ID) throw new OwnerRoleProtectedError()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Role name is required.')
  const roles = await listRoles()
  let updated: RoleDefinition | null = null
  const next = roles.map((r) => {
    if (r.id !== id) return r
    updated = stampUpdated({ ...r, name: trimmed }, userId)
    return updated
  })
  if (!updated) throw new Error('Role not found.')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'role', entityId: id, operation: 'update' })
  return updated
}

/** Archiving (not deleting) is blocked outright for Owner, and blocked
 *  for any role currently assigned to an active staff member, the same
 *  referential-integrity guard used for categories elsewhere in this
 *  app, so nobody ends up with an orphaned, unresolvable role.
 *
 *  `activeAssigneeCount` is supplied by the caller (real staff data from
 *  imagecare.users via settingsService.listStaff) rather than looked up
 *  here, since the local staffService this file used to call reads a
 *  separate, unrelated local staff collection that would give a false
 *  "0 assignees" reading against real staff records. */
export async function archiveRole(id: string, userId: string, activeAssigneeCount: number): Promise<void> {
  if (id === OWNER_ROLE_ID) throw new OwnerRoleProtectedError()
  if (activeAssigneeCount > 0) throw new RoleInUseError(activeAssigneeCount)

  const roles = await listRoles()
  const next = roles.map((r) => (r.id === id ? stampUpdated({ ...r, is_active: false }, userId) : r))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'role', entityId: id, operation: 'disable' })
}
