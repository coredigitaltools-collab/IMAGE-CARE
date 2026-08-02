import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { getProduct, _internalSetCurrentStock } from './productService'
import type { StockAdjustment, StockAdjustmentInput, StockMovement, StockMovementType } from '../types/inventory'

const MOVEMENTS_KEY = 'inventory:stock-movements'
const ADJUSTMENTS_KEY = 'inventory:stock-adjustments'

export class NegativeStockError extends Error {
  constructor(available: number, requested: number) {
    super(`Not enough stock: ${available} available, ${Math.abs(requested)} requested.`)
    this.name = 'NegativeStockError'
  }
}

export async function listMovements(productId?: string): Promise<StockMovement[]> {
  const movements = await getCollection<StockMovement>(MOVEMENTS_KEY, () => [])
  const sorted = [...movements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return productId ? sorted.filter((m) => m.productId === productId) : sorted
}

interface RecordMovementInput {
  productId: string
  type: StockMovementType
  quantityChange: number
  reason?: string | null
  branchId?: string | null
}

/** The single path by which currentStock ever changes (IMP-003 §18
 *  "transaction-based inventory"). Validates the result never goes
 *  negative (IMP-003 §17), writes a permanent movement record (§11),
 *  then updates the product's currentStock to match. */
export async function recordMovement(input: RecordMovementInput, userId: string): Promise<StockMovement> {
  const product = await getProduct(input.productId)
  if (!product) throw new Error('Product not found')

  const quantityAfter = product.currentStock + input.quantityChange
  if (quantityAfter < 0) {
    throw new NegativeStockError(product.currentStock, input.quantityChange)
  }

  const movement: StockMovement = {
    id: crypto.randomUUID(),
    productId: input.productId,
    branchId: input.branchId ?? product.branch_id,
    type: input.type,
    quantityChange: input.quantityChange,
    quantityAfter,
    reason: input.reason ?? null,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }

  const movements = await getCollection<StockMovement>(MOVEMENTS_KEY, () => [])
  await setCollection(MOVEMENTS_KEY, [movement, ...movements])
  await _internalSetCurrentStock(input.productId, quantityAfter, userId)
  await enqueueSync({ entityType: 'stock_movement', entityId: movement.id, operation: 'create' })

  return movement
}

export async function listAdjustments(): Promise<StockAdjustment[]> {
  const adjustments = await getCollection<StockAdjustment>(ADJUSTMENTS_KEY, () => [])
  return [...adjustments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/** IMP-003 §12: adjustments require a mandatory reason and are authorized.
 *  There's no multi-step approval workflow yet (no pending/approved
 *  states), the acting user is recorded as both creator and authorizer,
 *  which is honest about today's single-user-session reality while
 *  keeping the field structure ready for a real approval flow later. */
export async function createAdjustment(input: StockAdjustmentInput, userId: string): Promise<StockAdjustment> {
  if (!input.reason.trim()) throw new Error('A reason is required for stock adjustments.')

  const movement = await recordMovement(
    { productId: input.productId, type: 'adjustment', quantityChange: input.quantityChange, reason: input.reason },
    userId,
  )

  const product = await getProduct(input.productId)
  const adjustment: StockAdjustment = {
    id: crypto.randomUUID(),
    productId: input.productId,
    branchId: product?.branch_id ?? null,
    quantityChange: input.quantityChange,
    reason: input.reason,
    authorizedBy: userId,
    createdAt: movement.createdAt,
    createdBy: userId,
  }

  const adjustments = await getCollection<StockAdjustment>(ADJUSTMENTS_KEY, () => [])
  await setCollection(ADJUSTMENTS_KEY, [adjustment, ...adjustments])
  await enqueueSync({ entityType: 'stock_adjustment', entityId: adjustment.id, operation: 'create' })

  return adjustment
}
