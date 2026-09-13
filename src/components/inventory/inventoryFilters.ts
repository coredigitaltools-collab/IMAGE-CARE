export interface InventoryFilters {
  categoryId: string
  supplierId: string
  status: string
  branchId: string
}

export const EMPTY_FILTERS: InventoryFilters = {
  categoryId: 'all',
  supplierId: 'all',
  status: 'all',
  branchId: 'all',
}
