import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Package, PackageX, Plus, Search } from 'lucide-react'
import { formatCurrency } from '../../lib/format'
import type { Product } from '../../types/inventory'

export interface ProductPickerHandle {
  focusSearch: () => void
}

interface ProductPickerProps {
  products: Product[]
  onAdd: (product: Product, quantity: number) => void
}

// The compact "search, pick a product, set a quantity, add it" step used
// inside the Record Sale modal. Replaces the full-page ProductSearchGrid
// (a tile grid meant for a dedicated checkout screen) with something that
// fits a modal, while keeping the same underlying add-to-cart call and the
// barcode-scan-then-Enter shortcut from the original POS workflow (IMP-004).
export const ProductPicker = forwardRef<ProductPickerHandle, ProductPickerProps>(function ProductPicker(
  { products, onAdd },
  ref,
) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)
  // 2026-09-01: qty used to be a plain number defaulting to 1, and every
  // keystroke ran `Number(e.target.value) || 1` - so the instant the field
  // was cleared to type a fresh value, the empty string became 0, `0 || 1`
  // snapped it straight back to "1" before the next digit could even be
  // typed. That's exactly the reported bug ("I tried deleting the 1 but
  // it's not going"). qty is now allowed to sit empty (null) while the
  // cashier is actively clearing/retyping it - only forced back to a valid
  // 1 if the field is left empty on blur. Nothing about Add-item validation
  // changed: canAdd still requires a real quantity above 0.
  const [qty, setQty] = useState<number | null>(1)
  const inputRef = useRef<HTMLInputElement>(null)
  const qtyInputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focusSearch: () => inputRef.current?.focus(),
  }))

  const sellable = useMemo(() => products.filter((p) => p.status === 'active'), [products])

  // 2026-09-01: this used to return nothing at all until the cashier typed
  // something, so the field looked like a plain text box with no hint that
  // there was a product list behind it - the user's exact complaint
  // ("one should not have to type the product again, there should be a
  // dropdown from the products already in inventory"). Now an empty query
  // browses the first 50 active products (still narrows as you type, same
  // as before) so opening the field alone shows something to pick from.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sellable.slice(0, 50)
    return sellable
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q))
      .slice(0, 8)
  }, [sellable, query])

  const selectProduct = (product: Product) => {
    setSelected(product)
    setQuery('')
    setIsOpen(false)
    setQty(1)
  }

  // 2026-09-01: the Qty field always starts at 1, but nothing moved focus
  // into it after picking a product, and even when the cashier clicked in
  // manually the cursor landed AFTER the existing "1" - so typing "3" to
  // record 3 units inserted after the 1 instead of replacing it, producing
  // "13". Confirmed live: exactly the bug reported. Focusing and
  // select()-ing the field the instant a product is chosen means the "1"
  // is already highlighted, so the very next keystroke replaces it outright.
  useEffect(() => {
    if (selected) {
      qtyInputRef.current?.focus()
      qtyInputRef.current?.select()
    }
  }, [selected])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    // Barcode scanners type the code then send Enter - an exact match goes
    // straight into the cart at qty 1 so a cashier can keep scanning
    // without touching the mouse.
    const exact = sellable.find((p) => p.barcode === query.trim())
    if (exact) {
      onAdd(exact, 1)
      setQuery('')
      inputRef.current?.focus()
    }
  }

  const lineTotal = selected ? selected.sellingPrice * (qty ?? 0) : 0
  const canAdd = selected !== null && (qty ?? 0) > 0 && (qty ?? 0) <= selected.currentStock

  const handleAdd = () => {
    if (!selected || !canAdd) return
    onAdd(selected, qty ?? 1)
    setSelected(null)
    setQty(1)
    inputRef.current?.focus()
  }

  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Add items to sale</p>

      <label htmlFor="rs-product" className="mb-2 block text-sm font-medium text-ink-700">
        Product
      </label>
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-blue-100 bg-brand-blue-50 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">{selected.name}</p>
            <p className="text-xs text-ink-500">
              {selected.sku} · {selected.currentStock} in stock
            </p>
          </div>
          <button onClick={() => setSelected(null)} className="shrink-0 text-xs font-medium text-brand-blue-700 hover:underline">
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            id="rs-product"
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder="Search product or scan barcode..."
            autoFocus
            className="w-full rounded-lg border border-ink-100 bg-white py-3.5 pl-10 pr-4 text-sm text-ink-900 shadow-card placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-blue-500"
          />
          {isOpen && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-card-hover">
              {matches.length === 0 ? (
                <p className="px-3 py-3 text-xs text-ink-500">
                  {sellable.length === 0 ? 'No products yet, add one from Inventory first.' : `No products match "${query}"`}
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto">
                  {matches.map((p) => {
                    const outOfStock = p.currentStock === 0
                    return (
                      <li key={p.id}>
                        <button
                          onMouseDown={() => !outOfStock && selectProduct(p)}
                          disabled={outOfStock}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-50">
                              {p.imageDataUrl ? (
                                <img src={p.imageDataUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Package size={13} className="text-ink-300" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-ink-900">{p.name}</span>
                              <span className="block text-xs text-ink-500">{p.sku}</span>
                            </span>
                          </span>
                          {outOfStock ? (
                            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-red-700">
                              <PackageX size={11} /> Out of stock
                            </span>
                          ) : (
                            <span className="shrink-0 text-xs font-semibold text-ink-900">{formatCurrency(p.sellingPrice, 'UGX')}</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rs-qty" className="mb-2 block text-sm font-medium text-ink-700">
              Qty
            </label>
            <input
              id="rs-qty"
              ref={qtyInputRef}
              type="number"
              min={1}
              max={selected.currentStock}
              value={qty ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                setQty(raw === '' ? null : Math.max(0, Number(raw) || 0))
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => {
                if (!qty || qty < 1) setQty(1)
              }}
              className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">Price / unit</label>
            <div className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3.5 text-sm text-ink-500">
              {formatCurrency(selected.sellingPrice, 'UGX')}
            </div>
          </div>
          {(qty ?? 0) > selected.currentStock && (
            <p className="col-span-2 -mt-1 text-xs text-brand-red-700">Only {selected.currentStock} in stock.</p>
          )}
          <div className="col-span-2 flex items-center justify-between gap-2 border-t border-ink-100 pt-4">
            <div>
              <p className="text-xs text-ink-500">Line total</p>
              <p className="text-base font-semibold text-ink-900">{formatCurrency(lineTotal, 'UGX')}</p>
            </div>
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="flex items-center gap-1.5 rounded-lg bg-brand-blue-700 px-5 py-3 text-sm font-medium text-white hover:bg-brand-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} /> Add item
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
