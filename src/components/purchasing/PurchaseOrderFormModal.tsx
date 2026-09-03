import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { FormRow } from '../settings/FormRow'
import { ProductLineItemsEditor } from './ProductLineItemsEditor'
import { formatCurrency } from '../../lib/format'
import type { LineItemRow } from './ProductLineItemsEditor'
import type { Product, Supplier } from '../../types/inventory'
import type { PurchaseOrderInput } from '../../types/purchasing'

interface PurchaseOrderFormModalProps {
  suppliers: Supplier[]
  products: Product[]
  onClose: () => void
  onSubmit: (input: PurchaseOrderInput) => Promise<void>
  submitError?: string
}

// Workflow change (2026-09-03, "remove requisitions / simplify purchase
// order workflow"): `requisitionId`/`initialRows` used to let
// RequisitionsPage's "Convert to order" pre-fill this form from a
// requisition's items. Requisitions are gone (RequisitionsPage deleted),
// so both props are removed - this form's only remaining caller is
// "Record a purchase" / "New order", always starting from a blank order.
export function PurchaseOrderFormModal({ suppliers, products, onClose, onSubmit, submitError: externalSubmitError }: PurchaseOrderFormModalProps) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [rows, setRows] = useState<LineItemRow[]>(products[0] ? [{ productId: products[0].id, quantity: 1, unitCost: 0 }] : [])
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Bug fix (2026-09-03): this form has always accepted a `submitError`
  // prop and rendered it below, but neither of its two callers
  // (PurchaseOrdersPage, PurchaseDashboardPage) ever actually passed one -
  // if recording a purchase order failed for any reason (permission error,
  // network error, the new auto-confirm step failing), the button just
  // silently reset with nothing on screen, the same silent-failure bug
  // already found and fixed once on the Requisition form. Since this is
  // now the one and only way to create a purchase order, this form now
  // catches and shows its own error rather than depending on a caller that
  // never set one.
  const [localSubmitError, setLocalSubmitError] = useState<string | undefined>()
  const submitError = externalSubmitError ?? localSubmitError

  const total = rows.reduce((sum, r) => sum + r.quantity * (r.unitCost ?? 0), 0)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setLocalSubmitError(undefined)
    try {
      await onSubmit({
        supplierId,
        requisitionId: null,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes,
        items: rows
          .filter((r) => r.productId)
          .map((r) => {
            const product = products.find((p) => p.id === r.productId)
            return {
              productId: r.productId,
              productName: product?.name ?? '',
              sku: product?.sku ?? '',
              quantityOrdered: r.quantity,
              quantityReceived: 0,
              unitCost: r.unitCost ?? 0,
            }
          }),
      })
    } catch (err) {
      setLocalSubmitError(err instanceof Error ? err.message : 'Could not record this purchase order. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="New purchase order" onClose={onClose} size="xl">
      {/* Modal.tsx now provides the scrollable body itself. size="xl" gives
          the line-item editor (product/qty/unit-cost columns) real width
          instead of squeezing it into the old default max-w-lg. */}
      <div className="space-y-5">
        <FormRow>
          <div>
            <label htmlFor="po-supplier" className="mb-1.5 block text-sm font-medium text-ink-700">
              Supplier
            </label>
            <select
              id="po-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {suppliers.length === 0 && <option value="">No suppliers yet, add one under Inventory → Suppliers</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="po-delivery" className="mb-1.5 block text-sm font-medium text-ink-700">
              Expected delivery date (optional)
            </label>
            <input
              id="po-delivery"
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
        </FormRow>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Line items</label>
          <ProductLineItemsEditor products={products} rows={rows} onChange={setRows} quantityLabel="Quantity ordered" />
        </div>

        <div>
          <label htmlFor="po-notes" className="mb-1.5 block text-sm font-medium text-ink-700">
            Notes
          </label>
          <textarea
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>

        <p className="rounded-md bg-ink-50 px-3 py-2 text-sm">
          Order total: <span className="font-semibold text-ink-900">{formatCurrency(total, 'UGX')}</span>
        </p>

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || suppliers.length === 0 || rows.length === 0}>
            {isSubmitting ? 'Recording…' : 'Record purchase order'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
