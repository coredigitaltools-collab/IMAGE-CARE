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
  // Bug fix (2026-09-03, "requisition is not recording"): this form used to
  // have no way to show a failed save at all - if onSubmit rejected for any
  // reason (permission error, network error, backend validation), the
  // button just silently reset to "Submit for approval" with nothing on
  // screen to explain why. A user testing this reported exactly that
  // symptom. Live data confirmed their requisitions actually WERE saved to
  // the database both times (the real bug was a separate list-loading issue
  // that has been fixed separately) - but this form still had no way to
  // surface a genuine failure if one occurred, unlike every other
  // Purchasing modal (SupplierInvoiceModal, GoodsReceiptModal, etc.), which
  // all show a submitError message. This brings this form in line with
  // those.
  const [submitError, setSubmitError] = useState<string | undefined>()

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(undefined)
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
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit this requisition. Please try again.')
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
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
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
