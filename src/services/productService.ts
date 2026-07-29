import { getCollection, setCollection, enqueueSync, withSingleFlight } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedCategories, seedBrands, seedUnits, seedSuppliers, seedProducts } from '../data/inventorySeed'
import { listCategories } from './categoryService'
import { listBrands } from './brandService'
import { listUnits } from './unitService'
import { listSuppliers } from './supplierService'
import { recordMovement } from './stockService'
import type { Product, ProductInput } from '../types/inventory'

const KEY = 'inventory:products'

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`SKU "${sku}" is already in use.`)
    this.name = 'DuplicateSkuError'
  }
}

export class DuplicateBarcodeError extends Error {
  constructor(barcode: string) {
    super(`Barcode "${barcode}" is already in use.`)
    this.name = 'DuplicateBarcodeError'
  }
}

export class ArchivedProductError extends Error {
  constructor() {
    super('This product is archived and cannot be sold or restocked. Reactivate it first.')
    this.name = 'ArchivedProductError'
  }
}

export async function listProducts(): Promise<Product[]> {
  const cached = await getCollection<Product>(KEY, () => [])
  if (cached.length > 0) return cached
  return withSingleFlight(`${KEY}:dependent-seed`, async () => {
    // Re-check — another concurrent caller may have just finished seeding.
    const recheck = await getCollection<Product>(KEY, () => [])
    if (recheck.length > 0) return recheck
    // Products depend on categories/brands/units/suppliers existing first.
    const [categories, brands, units, suppliers] = await Promise.all([
      listCategories(),
      listBrands(),
      listUnits(),
      listSuppliers(),
    ])
    const seeded = seedProducts(categories, brands, units, suppliers)
    await setCollection(KEY, seeded)
    return seeded
  })
}

export async function getProduct(id: string): Promise<Product | null> {
  const products = await listProducts()
  return products.find((p) => p.id === id) ?? null
}

function normalize(value: string): string {
  return value.trim().toUpperCase()
}

async function assertUniqueSkuAndBarcode(sku: string, barcode: string, excludeId?: string) {
  const products = await listProducts()
  const normSku = normalize(sku)
  const normBarcode = normalize(barcode)
  if (products.some((p) => p.id !== excludeId && normalize(p.sku) === normSku)) {
    throw new DuplicateSkuError(sku)
  }
  if (barcode && products.some((p) => p.id !== excludeId && normalize(p.barcode) === normBarcode)) {
    throw new DuplicateBarcodeError(barcode)
  }
}

export async function generateSku(): Promise<string> {
  const products = await listProducts()
  const numbers = products
    .map((p) => Number(p.sku.replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n))
  const next = (numbers.length > 0 ? Math.max(...numbers) : 1000) + 1
  return `SKU-${next}`
}

export function generateBarcode(): string {
  // 12 random digits + a simple checksum-free 13th digit — good enough for
  // internal use and Code128/EAN rendering; not a registered GS1 prefix.
  let digits = ''
  for (let i = 0; i < 13; i++) digits += Math.floor(Math.random() * 10)
  return digits
}

export async function createProduct(input: ProductInput, userId: string): Promise<Product> {
  await assertUniqueSkuAndBarcode(input.sku, input.barcode)
  const products = await listProducts()
  const product: Product = {
    ...stampNew(userId, input.branch_id),
    ...input,
    currentStock: input.openingStock,
    status: 'active',
    imageDataUrl: input.imageDataUrl,
  }
  await setCollection(KEY, [...products, product])
  await enqueueSync({ entityType: 'product', entityId: product.id, operation: 'create' })

  // Opening stock is itself a movement, per IMP-003 §11 ("permanent audit
  // trail for every inventory movement") — even the very first stock count.
  if (input.openingStock !== 0) {
    await recordMovement(
      { productId: product.id, type: 'opening', quantityChange: input.openingStock, reason: 'Opening stock' },
      userId,
    )
  }
  return product
}

export async function updateProduct(id: string, input: ProductInput, userId: string): Promise<Product> {
  await assertUniqueSkuAndBarcode(input.sku, input.barcode, id)
  const products = await listProducts()
  let updated: Product | null = null
  const next = products.map((p) => {
    if (p.id !== id) return p
    // Stock is transaction-based (IMP-003 §18) — editing the product form
    // never changes currentStock directly; openingStock is historical only
    // once the product exists. Adjustments/movements are the only path.
    updated = stampUpdated({ ...p, ...input, currentStock: p.currentStock }, userId)
    return updated
  })
  if (!updated) throw new Error('Product not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'product', entityId: id, operation: 'update' })
  return updated
}

export async function archiveProduct(id: string, userId: string): Promise<void> {
  const products = await listProducts()
  const next = products.map((p) => (p.id === id ? stampUpdated({ ...p, status: 'archived', is_active: false }, userId) : p))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'product', entityId: id, operation: 'disable' })
}

export async function reactivateProduct(id: string, userId: string): Promise<void> {
  const products = await listProducts()
  const next = products.map((p) => (p.id === id ? stampUpdated({ ...p, status: 'active', is_active: true }, userId) : p))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'product', entityId: id, operation: 'update' })
}

export async function duplicateProduct(id: string, userId: string): Promise<Product> {
  const source = await getProduct(id)
  if (!source) throw new Error('Product not found')
  const newSku = await generateSku()
  const product: Product = {
    ...stampNew(userId, source.branch_id),
    name: `Copy of ${source.name}`,
    sku: newSku,
    barcode: generateBarcode(),
    imageDataUrl: source.imageDataUrl,
    categoryId: source.categoryId,
    brandId: source.brandId,
    unitId: source.unitId,
    supplierId: source.supplierId,
    description: source.description,
    notes: source.notes,
    buyingPrice: source.buyingPrice,
    sellingPrice: source.sellingPrice,
    taxRateId: source.taxRateId,
    reorderLevel: source.reorderLevel,
    openingStock: 0,
    currentStock: 0,
    status: 'active',
  }
  const products = await listProducts()
  await setCollection(KEY, [...products, product])
  await enqueueSync({ entityType: 'product', entityId: product.id, operation: 'create' })
  return product
}

/** Internal — called only by stockService after a movement is recorded. */
export async function _internalSetCurrentStock(id: string, newStock: number, userId: string): Promise<Product> {
  const products = await listProducts()
  let updated: Product | null = null
  const next = products.map((p) => {
    if (p.id !== id) return p
    updated = stampUpdated({ ...p, currentStock: newStock }, userId)
    return updated
  })
  if (!updated) throw new Error('Product not found')
  await setCollection(KEY, next)
  return updated
}

/** Used by Category "Merge" (IMP-003 §7) — reassigns every product on
 *  sourceCategoryId to targetCategoryId. */
export async function reassignProductCategory(sourceCategoryId: string, targetCategoryId: string, userId: string): Promise<void> {
  const products = await listProducts()
  const next = products.map((p) =>
    p.categoryId === sourceCategoryId ? stampUpdated({ ...p, categoryId: targetCategoryId }, userId) : p,
  )
  await setCollection(KEY, next)
}

export function assertSellable(product: Product): void {
  if (product.status === 'archived') throw new ArchivedProductError()
}

// Re-exported so a fresh install's seed order (categories/brands/units/
// suppliers before products) is explicit and discoverable from this file too.
export { seedCategories, seedBrands, seedUnits, seedSuppliers }
