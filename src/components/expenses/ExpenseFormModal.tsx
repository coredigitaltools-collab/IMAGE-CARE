import { useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { FormField } from '../settings/FormField'
import { MAX_ATTACHMENT_BYTES, AttachmentTooLargeError } from '../../services/expenseService'
import type { ExpenseAttachment, ExpenseCategory, ExpenseInput } from '../../types/expenses'

interface ExpenseFormModalProps {
  categories: ExpenseCategory[]
  onClose: () => void
  onSubmit: (input: ExpenseInput) => Promise<void>
}

export function ExpenseFormModal({ categories, onClose, onSubmit }: ExpenseFormModalProps) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [attachment, setAttachment] = useState<ExpenseAttachment | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFile = (file: File) => {
    setAttachmentError(undefined)
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError(new AttachmentTooLargeError().message)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({ fileName: file.name, mimeType: file.type, dataUrl: reader.result as string, sizeBytes: file.size })
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    const category = categories.find((c) => c.id === categoryId)
    setIsSubmitting(true)
    try {
      await onSubmit({
        categoryId,
        categoryName: category?.name ?? '',
        description,
        amount,
        branchId: null,
        expenseDate,
        attachment,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="New expense" onClose={onClose}>
      {categories.length === 0 ? (
        <p className="text-sm text-ink-500">Create an expense category first, under Categories.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="ex-category" className="mb-1.5 block text-sm font-medium text-ink-700">
              Category
            </label>
            <select
              id="ex-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ex-desc" className="mb-1.5 block text-sm font-medium text-ink-700">
              Description
            </label>
            <textarea
              id="ex-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="ex-amount" label="Amount (UGX)" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <div>
              <label htmlFor="ex-date" className="mb-1.5 block text-sm font-medium text-ink-700">
                Expense date
              </label>
              <input
                id="ex-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Receipt (optional)</label>
            {attachment ? (
              <div className="flex items-center justify-between rounded-md bg-ink-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 text-ink-700">
                  <Paperclip size={14} /> {attachment.fileName}
                </span>
                <button onClick={() => setAttachment(null)} className="text-ink-400 hover:text-brand-red-700">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="w-full text-sm text-ink-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-blue-700 hover:file:bg-brand-blue-100"
              />
            )}
            {attachmentError && <p className="mt-1 text-xs text-brand-red-700">{attachmentError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting || amount <= 0}>
              {isSubmitting ? 'Saving…' : 'Save as draft'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
