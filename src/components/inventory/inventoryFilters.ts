export interface InventoryFilters {
  categoryId: string
  supplierId: string
  brandId: string
  status: string
  branchId: string
}

export const EMPTY_FILTERS: InventoryFilters = {
  categoryId: 'all',
  supplierId: 'all',
  brandId: 'all',
  status: 'all',
  branchId: 'all',
}
