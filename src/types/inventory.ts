import type { AuditFields } from '../lib/audit'

export type ProductStatus = 'active' | 'archived'

export interface Product extends AuditFields {
  name: string
  sku: string
  barcode: string
  imageDataUrl: string | null
  categoryId: string
  brandId: string | null
  unitId: string
  supplierId: string | null
  description: string
  notes: string
  buyingPrice: number
  sellingPrice: number
  taxRateId: string | null
  reorderLevel: number
  openingStock: number
  currentStock: number
  status: ProductStatus
}

export type ProductInput = Pick<
  Product,
  | 'name'
  | 'sku'
  | 'barcode'
  | 'imageDataUrl'
  | 'categoryId'
  | 'brandId'
  | 'unitId'
  | 'supplierId'
  | 'description'
  | 'notes'
  | 'buyingPrice'
  | 'sellingPrice'
  | 'taxRateId'
  | 'reorderLevel'
  | 'openingStock'
  | 'branch_id'
>

export interface Category extends AuditFields {
  name: string
}
export type CategoryInput = { name: string }

export interface Brand extends AuditFields {
  name: string
}
export type BrandInput = { name: string }

export interface UnitOfMeasure extends AuditFields {
  name: string
  abbreviation: string
}
export type UnitInput = { name: string; abbreviation: string }

export type SupplierStatus = 'active' | 'inactive'

export interface Supplier extends AuditFields {
  name: string
  contactName: string
  phone: string
  email: string
  tin: string
  address: string
  notes: string
  status: SupplierStatus
}
export type SupplierInput = Pick<
  Supplier,
  'name' | 'contactName' | 'phone' | 'email' | 'tin' | 'address' | 'notes' | 'status'
>

// ---------- Stock movements & adjustments ----------

// IMP-003 §18: "transaction-based inventory" — currentStock is never edited
// directly; every change to it is the result of a StockMovement record, so
// stock levels can always be reconstructed/audited from movement history.
export type StockMovementType = 'opening' | 'purchase' | 'purchase_return' | 'sale' | 'refund' | 'adjustment' | 'transfer'

export interface StockMovement {
  id: string
  productId: string
  branchId: string | null
  type: StockMovementType
  quantityChange: number // positive = stock in, negative = stock out
  quantityAfter: number
  reason: string | null
  createdAt: string
  createdBy: string
}

export interface StockAdjustment {
  id: string
  productId: string
  branchId: string | null
  quantityChange: number
  reason: string
  authorizedBy: string
  createdAt: string
  createdBy: string
}

export type StockAdjustmentInput = Pick<StockAdjustment, 'productId' | 'quantityChange' | 'reason'>

// ---------- Inventory dashboard ----------

export interface InventoryKpis {
  totalProducts: number
  inventoryValue: number
  potentialProfit: number
  lowStockCount: number
  outOfStockCount: number
  categoriesCount: number
  suppliersCount: number
  currency: string
}
