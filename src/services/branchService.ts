import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedBranches } from '../data/settingsSeed'
import type { BranchInput, BranchRecord } from '../types/settings'

const KEY = 'settings:branches'

export class DuplicateBranchCodeError extends Error {
  constructor(code: string) {
    super(`Branch code "${code}" is already in use.`)
    this.name = 'DuplicateBranchCodeError'
  }
}

export async function listBranches(): Promise<BranchRecord[]> {
  return getCollection(KEY, seedBranches)
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export async function createBranch(input: BranchInput, userId: string): Promise<BranchRecord> {
  const branches = await listBranches()
  const code = normalizeCode(input.code)
  if (branches.some((b) => normalizeCode(b.code) === code)) {
    throw new DuplicateBranchCodeError(code)
  }
  const branch: BranchRecord = { ...stampNew(userId), ...input, code }
  const next = [...branches, branch]
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'branch', entityId: branch.id, operation: 'create' })
  return branch
}

export async function updateBranch(id: string, input: BranchInput, userId: string): Promise<BranchRecord> {
  const branches = await listBranches()
  const code = normalizeCode(input.code)
  if (branches.some((b) => b.id !== id && normalizeCode(b.code) === code)) {
    throw new DuplicateBranchCodeError(code)
  }
  let updatedBranch: BranchRecord | null = null
  const next = branches.map((b) => {
    if (b.id !== id) return b
    updatedBranch = stampUpdated({ ...b, ...input, code }, userId)
    return updatedBranch
  })
  if (!updatedBranch) throw new Error('Branch not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'branch', entityId: id, operation: 'update' })
  return updatedBranch
}

export async function setBranchActive(id: string, isActive: boolean, userId: string): Promise<void> {
  const branches = await listBranches()
  const next = branches.map((b) => (b.id === id ? stampUpdated({ ...b, is_active: isActive }, userId) : b))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'branch', entityId: id, operation: 'update' })
}
