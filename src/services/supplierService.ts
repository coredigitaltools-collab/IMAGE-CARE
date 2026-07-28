import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedSuppliers } from '../data/inventorySeed'
import type { Supplier, SupplierInput } from '../types/inventory'

const KEY = 'inventory:suppliers'

export async function listSuppliers(): Promise<Supplier[]> {
  return getCollection(KEY, seedSuppliers)
}

export async function createSupplier(input: SupplierInput, userId: string): Promise<Supplier> {
  const suppliers = await listSuppliers()
  const supplier: Supplier = { ...stampNew(userId), ...input }
  await setCollection(KEY, [...suppliers, supplier])
  await enqueueSync({ entityType: 'supplier', entityId: supplier.id, operation: 'create' })
  return supplier
}

export async function updateSupplier(id: string, input: SupplierInput, userId: string): Promise<Supplier> {
  const suppliers = await listSuppliers()
  let updated: Supplier | null = null
  const next = suppliers.map((s) => {
    if (s.id !== id) return s
    updated = stampUpdated({ ...s, ...input }, userId)
    return updated
  })
  if (!updated) throw new Error('Supplier not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'supplier', entityId: id, operation: 'update' })
  return updated
}

export async function archiveSupplier(id: string, userId: string): Promise<void> {
  const suppliers = await listSuppliers()
  const next = suppliers.map((s) => (s.id === id ? stampUpdated({ ...s, is_active: false }, userId) : s))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'supplier', entityId: id, operation: 'disable' })
}
