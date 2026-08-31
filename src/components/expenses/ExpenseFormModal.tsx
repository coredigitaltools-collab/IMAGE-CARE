import { useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { ExpenseCategorySelect } from './ExpenseCategorySelect'
import { MAX_ATTACHMENT_BYTES, AttachmentTooLargeError } from '../../services/expenseService'
import type { ExpenseCategory } from '../../types/expenses'

// 2026-08-31: simplified at the user's explicit request ("do away with the
// register section...without draft,approval etc.make it simple") - this used
// to require picking from a pre-created category list (a hard blocker when
// none existed yet) because it modeled categoryId as a foreign key. The real
// backend (businessEngine.ts CreateExpenseInput / RecordExpenseCommand) has
// always taken category as a plain free-text string with no FK, so that
// blocker was never actually necessary. Category is now a plain text field.
//
// 2026-08-31 (later same day): the free-text-with-autocomplete field below
// was reported broken - a category created under Expenses -> Categories
// never showed up here, because the autocomplete list was ever only drawn
// from categories already used on past EXPENSES, not from the real
// categories table. Category is still stored as plain text (no FK change),
// but the input is now a real dropdown (ExpenseCategorySelect) sourced from
// useExpenseCategories(), with an inline "+ Add new category" so a business
// with zero categories yet is never blocked from recording its first expense.
export interface ExpenseFormValues {
  category: string
  description: string
  amount: number
  expenseDate: string
  attachment: { fileName: string; mimeType: string; dataUrl: string; sizeBytes: number } | null
}

interface ExpenseFormModalProps {
  title?: string
  submitLabel?: string
  initialValues?: Partial<ExpenseFormValues>
  categories?: ExpenseCategory[]
  /** Amount/date are locked when editing an already-posted expense - see
      updateExpense() in financialServices.ts for why. */
  lockAmount?: boolean
  onClose: () => void
  onSubmit: (input: ExpenseFormValues) => Promise<void>
}

export function ExpenseFormModal({
  title = 'Add expense',
  submitLabel = 'Save',
  initialValues,
  categories = [],
  lockAmount = false,
  onClose,
  onSubmit,
}: ExpenseFormModalProps) {
  const [category, setCategory] = useState(initialValues?.category ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [amount, setAmount] = useState(initialValues?.amount ?? 0)
  const [expenseDate, setExpenseDate] = useState(initialValues?.expenseDate ?? new Date().toISOString().slice(0, 10))
  const [attachment, setAttachment] = useState<ExpenseFormValues['attachment']>(initialValues?.attachment ?? null)
  const [attachmentError, setAttachmentError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 2026-08-31: previously, if onSubmit's mutation rejected (permission
  // denied, a business-rule violation, a network error), nothing caught it -
  // the Saving... spinner just quietly reverted to "Save" with the modal
  // still open and no explanation. That is indistinguishable from the
  // button doing nothing, which matches exactly what was reported ("Save
  // does not result in a visible saved expense"). Now the failure is always
  // shown, in plain language, and the form/entered data is preserved so the
  // user can just retry instead of re-typing everything.
  const [submitError, setSubmitError] = useState<string | undefined>()

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

  const canSubmit = category.trim().length > 0 && description.trim().length > 0 && amount > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitError(undefined)
    setIsSubmitting(true)
    try {
      await onSubmit({ category: category.trim(), description: description.trim(), amount, expenseDate, attachment })
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : 'Unable to save this expense. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-5">
        {submitError && (
          <div className="rounded-lg border border-brand-red-200 bg-brand-red-50 px-4 py-3 text-sm text-brand-red-700">
            {submitError}
          </div>
        )}
        <div>
          <label htmlFor="ex-date" className="mb-2 block text-sm font-medium text-ink-700">
            Date
          </label>
          <input
            id="ex-date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            disabled={lockAmount}
            className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500 disabled:bg-ink-50 disabled:text-ink-400"
          />
        </div>

        <ExpenseCategorySelect id="ex-category" categories={categories} value={category} onChange={setCategory} />

        <div>
          <label htmlFor="ex-desc" className="mb-2 block text-sm font-medium text-ink-700">
            Description
          </label>
          <textarea
            id="ex-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>

        <div>
          <NumberField
            id="ex-amount"
            label={`Amount (UGX)${lockAmount ? ' - locked once recorded' : ''}`}
            min={0}
            value={amount}
            disabled={lockAmount}
            onChange={setAmount}
          />
          {lockAmount && (
            <p className="mt-1.5 text-xs text-ink-500">
              To correct the amount, delete this expense and record it again - it's already posted to the books.
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-ink-700">Receipt (optional)</label>
          {attachment ? (
            <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3 text-sm">
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
              className="w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-blue-700 hover:file:bg-brand-blue-100"
            />
          )}
          {attachmentError && <p className="mt-1.5 text-xs text-brand-red-700">{attachmentError}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
