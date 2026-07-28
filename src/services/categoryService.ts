import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedCategories } from '../data/inventorySeed'
import type { Category, CategoryInput } from '../types/inventory'
import { reassignProductCategory } from './productService'

const KEY = 'inventory:categories'

export async function listCategories(): Promise<Category[]> {
  return getCollection(KEY, seedCategories)
}

export async function createCategory(input: CategoryInput, userId: string): Promise<Category> {
  const categories = await listCategories()
  const category: Category = { ...stampNew(userId), ...input }
  await setCollection(KEY, [...categories, category])
  await enqueueSync({ entityType: 'category', entityId: category.id, operation: 'create' })
  return category
}

export async function updateCategory(id: string, input: CategoryInput, userId: string): Promise<Category> {
  const categories = await listCategories()
  let updated: Category | null = null
  const next = categories.map((c) => {
    if (c.id !== id) return c
    updated = stampUpdated({ ...c, ...input }, userId)
    return updated
  })
  if (!updated) throw new Error('Category not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'category', entityId: id, operation: 'update' })
  return updated
}

export async function archiveCategory(id: string, userId: string): Promise<void> {
  const categories = await listCategories()
  const next = categories.map((c) => (c.id === id ? stampUpdated({ ...c, is_active: false }, userId) : c))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'category', entityId: id, operation: 'disable' })
}

/** Merges sourceId into targetId: every product on the source category is
 *  reassigned to the target, then the source category is archived (IMP-003
 *  §7 "Merge"). Products are never left pointing at an archived category. */
export async function mergeCategories(sourceId: string, targetId: string, userId: string): Promise<void> {
  if (sourceId === targetId) throw new Error('Cannot merge a category into itself.')
  await reassignProductCategory(sourceId, targetId, userId)
  await archiveCategory(sourceId, userId)
}
