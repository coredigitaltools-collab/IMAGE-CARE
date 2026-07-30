import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { ProductLineItemsEditor } from './ProductLineItemsEditor'
import type { LineItemRow } from './ProductLineItemsEditor'
import type { Product } from '../../types/inventory'
import type { RequisitionLineItem } from '../../types/purchasing'

interface RequisitionFormModalProps {
  products: Product[]
  onClose: () => void
  onSubmit: (items: RequisitionLineItem[], notes: string) => Promise<void>
}

export function RequisitionFormModal({ products, onClose, onSubmit }: RequisitionFormModalProps) {
  const [rows, setRows] = useState<LineItemRow[]>(products[0] ? [{ productId: products[0].id, quantity: 1 }] : [])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(
        rows
          .filter((r) => r.productId)
          .map((r) => {
            const product = products.find((p) => p.id === r.productId)
            return { productId: r.productId, productName: product?.name ?? '', sku: product?.sku ?? '', quantity: r.quantity, notes: '' }
          }),
        notes,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="New purchase requisition" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">What's needed</label>
          <ProductLineItemsEditor products={products} rows={rows} onChange={setRows} showUnitCost={false} />
        </div>
        <div>
          <label htmlFor="req-notes" className="mb-1.5 block text-sm font-medium text-ink-700">
            Reason / notes
          </label>
          <textarea
            id="req-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Why is this needed?"
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || rows.length === 0}>
            {isSubmitting ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
