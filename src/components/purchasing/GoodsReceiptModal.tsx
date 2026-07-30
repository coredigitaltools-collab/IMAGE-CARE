import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'
import type { PurchaseOrder, GoodsReceiptLineItem } from '../../types/purchasing'

interface GoodsReceiptModalProps {
  order: PurchaseOrder
  onClose: () => void
  onSubmit: (items: GoodsReceiptLineItem[], notes: string) => Promise<void>
  submitError?: string
}

export function GoodsReceiptModal({ order, onClose, onSubmit, submitError }: GoodsReceiptModalProps) {
  const remainingLines = order.items.filter((l) => l.quantityReceived < l.quantityOrdered)
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(remainingLines.map((l) => [l.productId, l.quantityOrdered - l.quantityReceived])),
  )
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const items: GoodsReceiptLineItem[] = remainingLines
        .map((line) => ({
          productId: line.productId,
          productName: line.productName,
          sku: line.sku,
          quantityReceived: quantities[line.productId] ?? 0,
          unitCost: line.unitCost,
        }))
        .filter((i) => i.quantityReceived > 0)
      await onSubmit(items, notes)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title={`Receive goods — ${order.reference}`} onClose={onClose}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2">
          {remainingLines.map((line) => {
            const remaining = line.quantityOrdered - line.quantityReceived
            return (
              <div key={line.productId} className="flex items-center justify-between gap-3 rounded-md bg-ink-50 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{line.productName}</p>
                  <p className="text-xs text-ink-500">
                    {line.sku} · {remaining} of {line.quantityOrdered} remaining · {formatCurrency(line.unitCost, 'UGX')} each
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={remaining}
                  value={quantities[line.productId] ?? 0}
                  onChange={(e) => setQuantities({ ...quantities, [line.productId]: Number(e.target.value) })}
                  aria-label={`Quantity received for ${line.productName}`}
                  className="w-20 shrink-0 rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
                />
              </div>
            )
          })}
        </div>

        <div>
          <label htmlFor="grn-notes" className="mb-1.5 block text-sm font-medium text-ink-700">
            Notes (optional)
          </label>
          <textarea
            id="grn-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Recording…' : 'Record receipt'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
