import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Search, X } from 'lucide-react'
import type { Category, Product } from '../../types/inventory'

interface InventorySearchBarProps {
  products: Product[]
  categories: Category[]
  value: string
  onChange: (value: string) => void
}

export function InventorySearchBar({ products, categories, value, onChange }: InventorySearchBarProps) {
  const navigate = useNavigate()
  const [isFocused, setIsFocused] = useState(false)

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? ''

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return products
      .filter(
        (p) =>
          p.status === 'active' &&
          (p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.barcode.includes(q) ||
            categoryName(p.categoryId).toLowerCase().includes(q)),
      )
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, products, categories])

  const showDropdown = isFocused && value.trim().length > 0

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        placeholder="Search by name, SKU, barcode, or category..."
        aria-label="Search products"
        className="w-full rounded-md border border-ink-100 bg-white py-2 pl-9 pr-9 text-sm text-ink-900 shadow-card transition-colors placeholder:text-ink-300 hover:border-ink-300 focus:border-brand-blue-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          <X size={15} />
        </button>
      )}

      {showDropdown && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-md border border-ink-100 bg-white shadow-card-hover">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-500">No products match "{value}".</p>
          ) : (
            <ul>
              {matches.map((product) => (
                <li key={product.id}>
                  <button
                    onMouseDown={() => navigate(`/inventory/products/${product.id}`)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-ink-50"
                  >
                    <Package size={14} className="shrink-0 text-ink-300" />
                    <span className="min-w-0 flex-1 truncate text-ink-900">{product.name}</span>
                    <span className="shrink-0 text-xs text-ink-500">{product.sku}</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  onMouseDown={() => navigate(`/inventory/products?q=${encodeURIComponent(value)}`)}
                  className="w-full border-t border-ink-100 px-3 py-2 text-left text-xs font-medium text-brand-blue-700 hover:bg-brand-blue-50"
                >
                  View all results in Products →
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
