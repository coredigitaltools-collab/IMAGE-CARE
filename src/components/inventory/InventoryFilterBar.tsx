import type { Brand, Category, Supplier } from '../../types/inventory'
import type { Branch } from '../../types/domain'

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

interface InventoryFilterBarProps {
  categories: Category[]
  suppliers: Supplier[]
  brands: Brand[]
  branches: Branch[]
  filters: InventoryFilters
  onChange: (filters: InventoryFilters) => void
}

const selectClass =
  'rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 shadow-card transition-colors hover:border-ink-300 focus:border-brand-blue-500'

export function InventoryFilterBar({ categories, suppliers, brands, branches, filters, onChange }: InventoryFilterBarProps) {
  const set = (key: keyof InventoryFilters) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value })

  const hasActiveFilters = Object.values(filters).some((v) => v !== 'all')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={filters.categoryId} onChange={set('categoryId')} className={selectClass} aria-label="Filter by category">
        <option value="all">All categories</option>
        {categories.filter((c) => c.is_active).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select value={filters.supplierId} onChange={set('supplierId')} className={selectClass} aria-label="Filter by supplier">
        <option value="all">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select value={filters.brandId} onChange={set('brandId')} className={selectClass} aria-label="Filter by brand">
        <option value="all">All brands</option>
        {brands.filter((b) => b.is_active).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <select value={filters.status} onChange={set('status')} className={selectClass} aria-label="Filter by status">
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>

      <select value={filters.branchId} onChange={set('branchId')} className={selectClass} aria-label="Filter by branch">
        <option value="all">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      {hasActiveFilters && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs font-medium text-brand-blue-700 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
