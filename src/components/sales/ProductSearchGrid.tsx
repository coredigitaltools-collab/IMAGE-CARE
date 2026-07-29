import { useMemo, useRef, useState } from 'react'
import { Package, Search } from 'lucide-react'
import { formatCurrency } from '../../lib/format'
import type { Product } from '../../types/inventory'

interface ProductSearchGridProps {
  products: Product[]
  onAdd: (product: Product) => void
}

export function ProductSearchGrid({ products, onAdd }: ProductSearchGridProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const sellable = products.filter((p) => p.status === 'active')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sellable
    return sellable.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q))
  }, [sellable, query])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    // Barcode scanners type the code then send Enter — if the current
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

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or scan barcode..."
          autoFocus
          className="w-full rounded-md border border-ink-100 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-900 shadow-card placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-blue-500"
        />
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2.5 overflow-y-auto sm:grid-cols-3">
        {filtered.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-ink-500">No products match "{query}".</p>
        ) : (
          filtered.map((product) => {
            const outOfStock = product.currentStock === 0
            return (
              <button
                key={product.id}
                onClick={() => !outOfStock && onAdd(product)}
                disabled={outOfStock}
                className="flex flex-col items-start gap-1 rounded-card border border-ink-100 bg-white p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-ink-100"
              >
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-ink-50">
                  {product.imageDataUrl ? (
                    <img src={product.imageDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package size={15} className="text-ink-300" />
                  )}
                </div>
                <p className="line-clamp-2 text-xs font-medium text-ink-900">{product.name}</p>
                <p className="text-xs font-semibold text-brand-blue-700">{formatCurrency(product.sellingPrice, 'UGX')}</p>
                <p className={`text-[10px] ${outOfStock ? 'text-brand-red-700' : 'text-ink-500'}`}>
                  {outOfStock ? 'Out of stock' : `${product.currentStock} in stock`}
                </p>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
