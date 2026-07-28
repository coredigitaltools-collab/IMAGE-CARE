import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedBrands } from '../data/inventorySeed'
import type { Brand, BrandInput } from '../types/inventory'

const KEY = 'inventory:brands'

export async function listBrands(): Promise<Brand[]> {
  return getCollection(KEY, seedBrands)
}

export async function createBrand(input: BrandInput, userId: string): Promise<Brand> {
  const brands = await listBrands()
  const brand: Brand = { ...stampNew(userId), ...input }
  await setCollection(KEY, [...brands, brand])
  await enqueueSync({ entityType: 'brand', entityId: brand.id, operation: 'create' })
  return brand
}

export async function updateBrand(id: string, input: BrandInput, userId: string): Promise<Brand> {
  const brands = await listBrands()
  let updated: Brand | null = null
  const next = brands.map((b) => {
    if (b.id !== id) return b
    updated = stampUpdated({ ...b, ...input }, userId)
    return updated
  })
  if (!updated) throw new Error('Brand not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'brand', entityId: id, operation: 'update' })
  return updated
}

export async function archiveBrand(id: string, userId: string): Promise<void> {
  const brands = await listBrands()
  const next = brands.map((b) => (b.id === id ? stampUpdated({ ...b, is_active: false }, userId) : b))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'brand', entityId: id, operation: 'disable' })
}
