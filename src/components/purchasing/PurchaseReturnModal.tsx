import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ProductLineItemsEditor } from './ProductLineItemsEditor'
import type { LineItemRow } from './ProductLineItemsEditor'
import type { Product, Supplier } from '../../types/inventory'
import type { PurchaseReturnLineItem } from '../../types/purchasing'

interface PurchaseReturnModalProps {
  suppliers: Supplier[]
  products: Product[]
  onClose: () => void
  onSubmit: (input: { supplierId: string; items: PurchaseReturnLineItem[]; reason: string }) => Promise<void>
  submitError?: string
}

export function PurchaseReturnModal({ suppliers, products, onClose, onSubmit, submitError }: PurchaseReturnModalProps) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [rows, setRows] = useState<LineItemRow[]>(products[0] ? [{ productId: products[0].id, quantity: 1, unitCost: 0 }] : [])
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit({
        supplierId,
        reason,
        items: rows
          .filter((r) => r.productId)
          .map((r) => {
            const product = products.find((p) => p.id === r.productId)
            return { productId: r.productId, productName: product?.name ?? '', sku: product?.sku ?? '', quantity: r.quantity, unitCost: r.unitCost ?? 0 }
          }),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Return goods to supplier" onClose={onClose} size="xl">
      {/* size="xl" gives the line-item editor the same room as the
          Purchase Order form's identical editor. */}
      <div className="space-y-5">
        <div className="max-w-sm">
          <label htmlFor="ret-supplier" className="mb-1.5 block text-sm font-medium text-ink-700">
            Supplier
          </label>
          <select
            id="ret-supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            {suppliers.length === 0 && <option value="">No suppliers yet</option>}
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Items being returned</label>
          <ProductLineItemsEditor products={products} rows={rows} onChange={setRows} />
        </div>
        <div>
          <label htmlFor="ret-reason" className="mb-1.5 block text-sm font-medium text-ink-700">
            Reason
          </label>
          <textarea
            id="ret-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Damaged on arrival, wrong item shipped"
            className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleSubmit} disabled={isSubmitting || suppliers.length === 0 || rows.length === 0}>
            {isSubmitting ? 'Saving…' : 'Record return'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
