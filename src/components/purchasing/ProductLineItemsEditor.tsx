import { Plus, Trash2 } from 'lucide-react'
import type { Product } from '../../types/inventory'

export interface LineItemRow {
  productId: string
  quantity: number
  unitCost?: number
}

interface ProductLineItemsEditorProps {
  products: Product[]
  rows: LineItemRow[]
  onChange: (rows: LineItemRow[]) => void
  showUnitCost?: boolean
  quantityLabel?: string
}

export function ProductLineItemsEditor({ products, rows, onChange, showUnitCost = true, quantityLabel = 'Qty' }: ProductLineItemsEditorProps) {
  const addRow = () => onChange([...rows, { productId: products[0]?.id ?? '', quantity: 1, unitCost: 0 }])
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index))
  const updateRow = (index: number, patch: Partial<LineItemRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={row.productId}
            onChange={(e) => updateRow(i, { productId: e.target.value })}
            className="min-w-0 flex-1 rounded-md border border-ink-100 bg-white px-2.5 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            {products.length === 0 && <option value="">No products available</option>}
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={row.quantity}
            onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
            aria-label={quantityLabel}
            className="w-20 shrink-0 rounded-md border border-ink-100 bg-white px-2.5 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          {showUnitCost && (
            <input
              type="number"
              min={0}
              value={row.unitCost ?? 0}
              onChange={(e) => updateRow(i, { unitCost: Number(e.target.value) })}
              aria-label="Unit cost"
              placeholder="Unit cost"
              className="w-28 shrink-0 rounded-md border border-ink-100 bg-white px-2.5 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          )}
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove line"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-brand-red-50 hover:text-brand-red-700"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={products.length === 0}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={13} /> Add line
      </button>
    </div>
  )
}
