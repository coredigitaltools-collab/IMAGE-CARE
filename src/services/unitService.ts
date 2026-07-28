import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedUnits } from '../data/inventorySeed'
import type { UnitInput, UnitOfMeasure } from '../types/inventory'

const KEY = 'inventory:units'

export async function listUnits(): Promise<UnitOfMeasure[]> {
  return getCollection(KEY, seedUnits)
}

export async function createUnit(input: UnitInput, userId: string): Promise<UnitOfMeasure> {
  const units = await listUnits()
  const unit: UnitOfMeasure = { ...stampNew(userId), ...input }
  await setCollection(KEY, [...units, unit])
  await enqueueSync({ entityType: 'unit', entityId: unit.id, operation: 'create' })
  return unit
}

export async function updateUnit(id: string, input: UnitInput, userId: string): Promise<UnitOfMeasure> {
  const units = await listUnits()
  let updated: UnitOfMeasure | null = null
  const next = units.map((u) => {
    if (u.id !== id) return u
    updated = stampUpdated({ ...u, ...input }, userId)
    return updated
  })
  if (!updated) throw new Error('Unit not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'unit', entityId: id, operation: 'update' })
  return updated
}

export async function archiveUnit(id: string, userId: string): Promise<void> {
  const units = await listUnits()
  const next = units.map((u) => (u.id === id ? stampUpdated({ ...u, is_active: false }, userId) : u))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'unit', entityId: id, operation: 'disable' })
}
