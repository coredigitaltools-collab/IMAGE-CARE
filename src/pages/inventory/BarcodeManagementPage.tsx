import { useMemo, useState } from 'react'
import { Barcode as BarcodeIcon, Printer, Search } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { BarcodeDisplay } from '../../components/inventory/BarcodeDisplay'
import { EmptyState } from '../../components/ui/EmptyState'
import { useProducts } from '../../features/inventory/hooks/useInventoryData'

export function BarcodeManagementPage() {
  const productsQuery = useProducts()
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const products = productsQuery.data

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return (products ?? []).filter((p) => p.status === 'active')
    return (products ?? []).filter(
      (p) => p.status === 'active' && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)),
    )
  }, [products, query])

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectedProducts = (products ?? []).filter((p) => selectedIds.includes(p.id))
  // Bug fix (2026-09-07): Print used to be enabled the moment anything was
  // selected, even products with no barcode value - clicking it then
  // called window.print() on cards that just read "No barcode set," which
  // opens a real (native, browser-owned) print dialog with nothing useful
  // in it, and gave no indication of why. Real product data in this
  // business currently has no barcode set on any product (an inventory
  // data-entry gap, not an app bug - "Barcode" is an optional field on the
  // product form). Print now only enables once at least one selected
  // product actually has a barcode to print, and clearly explains the gap
  // for any selected product that doesn't.
  const selectedWithBarcode = selectedProducts.filter((p) => p.barcode)
  const selectedWithoutBarcode = selectedProducts.filter((p) => !p.barcode)

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryTabs />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Barcode Management</h1>
          <p className="mt-0.5 text-sm text-ink-500">Search, generate, and print product barcode labels.</p>
        </div>
        <Button onClick={() => window.print()} disabled={selectedWithBarcode.length === 0}>
          <Printer size={15} /> Print {selectedWithBarcode.length > 0 ? `(${selectedWithBarcode.length})` : ''}
        </Button>
      </div>

      {selectedWithoutBarcode.length > 0 && (
        <p className="mb-4 rounded-md border border-warning-100 bg-warning-100/40 px-3 py-2 text-xs text-warning-700">
          {selectedWithoutBarcode.length} selected product{selectedWithoutBarcode.length === 1 ? '' : 's'} {selectedWithoutBarcode.length === 1 ? 'has' : 'have'} no
          barcode set, so {selectedWithoutBarcode.length === 1 ? "it won't" : "they won't"} print a usable label. Edit the product in Inventory to add one.
        </p>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, SKU, or barcode..."
          className="w-full rounded-md border border-ink-100 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
        />
      </div>

      {results.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={BarcodeIcon}
            title={query ? 'No products found' : 'No active products yet'}
            description={query ? 'Try a different search term.' : 'Add a product in Inventory, then its barcode label will be available here.'}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-3">
          {(query ? results : selectedProducts.length > 0 ? results : results.slice(0, 6)).map((product) => (
            <Card
              key={product.id}
              className={`flex items-center gap-3 p-3 print:break-inside-avoid ${selectedIds.includes(product.id) ? 'border-brand-blue-500' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(product.id)}
                onChange={() => toggle(product.id)}
                className="h-4 w-4 shrink-0 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500 print:hidden"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{product.name}</p>
                <p className="mb-1 text-xs text-ink-500">{product.sku}</p>
                <BarcodeDisplay value={product.barcode} width={1.4} height={36} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
