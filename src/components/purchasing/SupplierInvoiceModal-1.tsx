import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { SupplierFormModal } from '../inventory/SupplierFormModal'
import { useToast } from '../ui/toastContext'
import { useCreateSupplier } from '../../features/inventory/hooks/useInventoryData'
import type { PurchaseOrder } from '../../types/purchasing'
import type { Supplier } from '../../types/inventory'

interface SupplierInvoiceModalProps {
  suppliers: Supplier[]
  orders: PurchaseOrder[]
  userId: string
  onClose: () => void
  onSubmit: (input: { supplierId: string; purchaseOrderId: string | null; supplierInvoiceNumber: string; amount: number; dueDate: string | null }) => Promise<void>
  submitError?: string
}

export function SupplierInvoiceModal({ suppliers, orders, userId, onClose, onSubmit, submitError }: SupplierInvoiceModalProps) {
  const createSupplier = useCreateSupplier(userId)
  const { showToast } = useToast()
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [purchaseOrderId, setPurchaseOrderId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [amount, setAmount] = useState(0)
  const [dueDate, setDueDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 2026-08-31: "No suppliers yet" used to be a dead end - recording a
  // supplier invoice for a supplier that isn't in the system yet meant
  // closing this modal and going to add one in Inventory first. Now it can
  // be added inline, right here, without losing the rest of this form.
  const [isAddingSupplier, setIsAddingSupplier] = useState(suppliers.length === 0)

  const relatedOrders = orders.filter((o) => o.supplierId === supplierId && o.status !== 'draft' && o.status !== 'cancelled')

  // Bug fix (2026-09-03 human-testing round): picking a related purchase
  // order used to do nothing but store its id - the user still had to
  // work out and type the amount themselves even though the order already
  // has real priced line items. This pulls the order's own total (same
  // calculation PurchaseOrderDetailPage.tsx uses) into the Amount field
  // the moment an order is selected, so the invoice starts from the
  // order's real numbers instead of a blank form. It stays a normal,
  // editable field afterward - the supplier's actual invoice can
  // legitimately differ (shipping, rounding, a partial bill), so this
  // fills in a starting point rather than locking the figure.
  const handleSelectOrder = (orderId: string) => {
    setPurchaseOrderId(orderId)
    const order = relatedOrders.find((o) => o.id === orderId)
    if (order) {
      const orderTotal = order.items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0)
      setAmount(orderTotal)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit({ supplierId, purchaseOrderId: purchaseOrderId || null, supplierInvoiceNumber: invoiceNumber, amount, dueDate: dueDate || null })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAddingSupplier) {
    return (
      <SupplierFormModal
        onClose={() => {
          if (suppliers.length === 0) {
            onClose()
          } else {
            setIsAddingSupplier(false)
          }
        }}
        onSubmit={async (input) => {
          // Without this, a failed supplier save was an unhandled promise
          // rejection - the form stayed open saying nothing at all.
          try {
            const created = await createSupplier.mutateAsync(input)
            setSupplierId(created.id)
            setIsAddingSupplier(false)
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not save this supplier.')
          }
        }}
      />
    )
  }

  return (
    <Modal title="Record supplier invoice" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="inv-supplier" className="mb-1.5 block text-sm font-medium text-ink-700">
            Supplier
          </label>
          <div className="flex gap-2">
            <select
              id="inv-supplier"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value)
                setPurchaseOrderId('')
              }}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {suppliers.length === 0 && <option value="">No suppliers yet</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsAddingSupplier(true)}
              className="shrink-0 rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
            >
              + New
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="inv-po" className="mb-1.5 block text-sm font-medium text-ink-700">
            Related purchase order (optional)
          </label>
          <select
            id="inv-po"
            value={purchaseOrderId}
            onChange={(e) => handleSelectOrder(e.target.value)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            <option value="">None</option>
            {relatedOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.reference}
              </option>
            ))}
          </select>
          {purchaseOrderId && (
            <p className="mt-1 text-xs text-ink-500">Amount below was filled in from this order's total - adjust it if the supplier billed a different amount.</p>
          )}
        </div>
        <div>
          <label htmlFor="inv-number" className="mb-1.5 block text-sm font-medium text-ink-700">
            Supplier's invoice number
          </label>
          <input
            id="inv-number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="inv-amount" label="Amount (UGX)" min={0} value={amount} onChange={setAmount} />
          <div>
            <label htmlFor="inv-due" className="mb-1.5 block text-sm font-medium text-ink-700">
              Due date
            </label>
            <input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
        </div>
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || suppliers.length === 0 || amount <= 0}>
            {isSubmitting ? 'Saving…' : 'Record invoice'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
