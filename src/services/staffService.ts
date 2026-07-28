import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedStaff } from '../data/settingsSeed'
import { listBranches } from './branchService'
import type { StaffInput, StaffMember } from '../types/settings'

const KEY = 'settings:staff'

export class DuplicateUsernameError extends Error {
  constructor(username: string) {
    super(`Username "${username}" is already taken.`)
    this.name = 'DuplicateUsernameError'
  }
}

export class LastActiveOwnerError extends Error {
  constructor() {
    super("Can't disable the last active Owner. Promote another staff member to Owner first.")
    this.name = 'LastActiveOwnerError'
  }
}

export async function listStaff(): Promise<StaffMember[]> {
  const cached = await getCollection<StaffMember>(KEY, () => [])
  if (cached.length > 0) return cached
  // Staff seeding depends on branches existing first — seed lazily.
  const branches = await listBranches()
  const seeded = seedStaff(branches)
  await setCollection(KEY, seeded)
  return seeded
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

export async function createStaff(input: StaffInput, userId: string): Promise<StaffMember> {
  const staff = await listStaff()
  const username = normalizeUsername(input.username)
  if (staff.some((s) => normalizeUsername(s.username) === username)) {
    throw new DuplicateUsernameError(username)
  }
  const member: StaffMember = { ...stampNew(userId), ...input, username }
  const next = [...staff, member]
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'staff', entityId: member.id, operation: 'create' })
  return member
}

export async function updateStaff(id: string, input: StaffInput, userId: string): Promise<StaffMember> {
  const staff = await listStaff()
  const username = normalizeUsername(input.username)
  if (staff.some((s) => s.id !== id && normalizeUsername(s.username) === username)) {
    throw new DuplicateUsernameError(username)
  }

  // Business rule: can't demote the last active Owner away from the Owner role.
  const target = staff.find((s) => s.id === id)
  if (target?.role === 'owner' && input.role !== 'owner') {
    const activeOwners = staff.filter((s) => s.role === 'owner' && s.is_active)
    if (activeOwners.length <= 1) throw new LastActiveOwnerError()
  }

  let updated: StaffMember | null = null
  const next = staff.map((s) => {
    if (s.id !== id) return s
    updated = stampUpdated({ ...s, ...input, username }, userId)
    return updated
  })
  if (!updated) throw new Error('Staff member not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'staff', entityId: id, operation: 'update' })
  return updated
}

export async function disableStaff(id: string, userId: string): Promise<void> {
  const staff = await listStaff()
  const target = staff.find((s) => s.id === id)
  if (!target) throw new Error('Staff member not found')

  if (target.role === 'owner') {
    const activeOwners = staff.filter((s) => s.role === 'owner' && s.is_active && s.id !== id)
    if (activeOwners.length === 0) throw new LastActiveOwnerError()
  }

  // Business rule: never permanently delete staff with transactions —
  // this disables (soft delete) rather than removing the record.
  const next = staff.map((s) => (s.id === id ? stampUpdated({ ...s, is_active: false }, userId) : s))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'staff', entityId: id, operation: 'disable' })
}

export async function reactivateStaff(id: string, userId: string): Promise<void> {
  const staff = await listStaff()
  const next = staff.map((s) => (s.id === id ? stampUpdated({ ...s, is_active: true }, userId) : s))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'staff', entityId: id, operation: 'update' })
}

/** Mock — real password reset requires Supabase Auth (not yet connected).
 *  Returns a temporary password so the flow is genuinely testable today;
 *  swap this for a Supabase Auth admin call once configured. */
export async function resetStaffPassword(_id: string): Promise<{ temporaryPassword: string }> {
  const temp = Math.random().toString(36).slice(-10)
  return { temporaryPassword: temp }
}
