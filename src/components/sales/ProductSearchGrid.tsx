import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Package, PackageX, Search } from 'lucide-react'
import { formatCurrency } from '../../lib/format'
import type { Category, Product } from '../../types/inventory'

export interface ProductSearchGridHandle {
  focusSearch: () => void
}

interface ProductSearchGridProps {
  products: Product[]
  categories: Category[]
  onAdd: (product: Product) => void
}

export const ProductSearchGrid = forwardRef<ProductSearchGridHandle, ProductSearchGridProps>(function ProductSearchGrid(
  { products, categories, onAdd },
  ref,
) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focusSearch: () => inputRef.current?.focus(),
  }))

  const sellable = products.filter((p) => p.status === 'active')
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? ''

  // Only categories that actually have a sellable product show up as a
  // chip, an empty install shows just "All", nothing pre-populated.
  const categoriesWithProducts = useMemo(() => {
    const ids = new Set(sellable.map((p) => p.categoryId))
    return categories.filter((c) => ids.has(c.id))
     
  }, [sellable, categories])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sellable.filter((p) => {
      if (categoryId !== 'all' && p.categoryId !== categoryId) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)
    })
     
  }, [sellable, query, categoryId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    // Barcode scanners type the code then send Enter, if the current
    // query is an exact barcode match, add it straight to the cart and
    // clear the field so the cashier can keep scanning without touching
    // the mouse (IMP-004 POS Workflow: "scan barcode").
    const exact = sellable.find((p) => p.barcode === query.trim())
    if (exact) {
      onAdd(exact)
      setQuery('')
      inputRef.current?.focus()
    }
  }

  const noProductsAtAll = sellable.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or scan barcode... (F2)"
          autoFocus
          className="w-full rounded-md border border-ink-100 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-900 shadow-card placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-blue-500"
        />
      </div>

      {!noProductsAtAll && categoriesWithProducts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryId('all')}
            className={
              categoryId === 'all'
                ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
            }
          >
            All
          </button>
          {categoriesWithProducts.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className={
                categoryId === c.id
                  ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
              }
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid flex-1 grid-cols-2 gap-2.5 overflow-y-auto sm:grid-cols-3">
        {noProductsAtAll ? (
          <div className="col-span-full flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Package size={22} className="text-ink-300" />
            <p className="text-sm font-medium text-ink-900">No products found</p>
            <p className="max-w-xs text-xs text-ink-500">Add your first product to get started, it'll show up here right away.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-ink-500">
            {query ? `No products match "${query}".` : 'No products in this category.'}
          </p>
        ) : (
          filtered.map((product) => {
            const outOfStock = product.currentStock === 0
            return (
              <button
                key={product.id}
                onClick={() => !outOfStock && onAdd(product)}
                disabled={outOfStock}
                aria-disabled={outOfStock}
                className="group relative flex flex-col items-start gap-1 overflow-hidden rounded-card border border-ink-100 bg-white p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:border-ink-100 disabled:hover:shadow-card"
              >
                {outOfStock && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
                    <span className="flex items-center gap-1 rounded-full bg-brand-red-100 px-2.5 py-1 text-[11px] font-semibold text-brand-red-700">
                      <PackageX size={11} /> Out of stock
                    </span>
                  </div>
                )}
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-ink-50">
                  {product.imageDataUrl ? (
                    <img src={product.imageDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package size={15} className="text-ink-300" />
                  )}
                </div>
                <p className="line-clamp-2 text-xs font-medium text-ink-900">{product.name}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-ink-500">{product.sku}</span>
                  {categoryName(product.categoryId) && (
                    <span className="rounded-full bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                      {categoryName(product.categoryId)}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-brand-blue-700">{formatCurrency(product.sellingPrice, 'UGX')}</p>
                {!outOfStock && (
                  <p className={`text-[10px] ${product.currentStock <= product.reorderLevel ? 'text-warning-700' : 'text-ink-500'}`}>
                    {product.currentStock} in stock
                  </p>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
})
