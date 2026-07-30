import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { PurchaseOrder } from '../../types/purchasing'
import type { Supplier } from '../../types/inventory'

interface SupplierInvoiceModalProps {
  suppliers: Supplier[]
  orders: PurchaseOrder[]
  onClose: () => void
  onSubmit: (input: { supplierId: string; purchaseOrderId: string | null; supplierInvoiceNumber: string; amount: number; dueDate: string | null }) => Promise<void>
  submitError?: string
}

export function SupplierInvoiceModal({ suppliers, orders, onClose, onSubmit, submitError }: SupplierInvoiceModalProps) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [purchaseOrderId, setPurchaseOrderId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [amount, setAmount] = useState(0)
  const [dueDate, setDueDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const relatedOrders = orders.filter((o) => o.supplierId === supplierId && o.status !== 'draft' && o.status !== 'cancelled')

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit({ supplierId, purchaseOrderId: purchaseOrderId || null, supplierInvoiceNumber: invoiceNumber, amount, dueDate: dueDate || null })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Record supplier invoice" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="inv-supplier" className="mb-1.5 block text-sm font-medium text-ink-700">
            Supplier
          </label>
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
        </div>
        <div>
          <label htmlFor="inv-po" className="mb-1.5 block text-sm font-medium text-ink-700">
            Related purchase order (optional)
          </label>
          <select
            id="inv-po"
            value={purchaseOrderId}
            onChange={(e) => setPurchaseOrderId(e.target.value)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            <option value="">None</option>
            {relatedOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.reference}
              </option>
            ))}
          </select>
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
          <div>
            <label htmlFor="inv-amount" className="mb-1.5 block text-sm font-medium text-ink-700">
              Amount (UGX)
            </label>
            <input
              id="inv-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
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
