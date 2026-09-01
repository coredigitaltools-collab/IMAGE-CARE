import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

// ============================================================
// ImageCare ERP - Branded confirm/prompt dialog
// File: src/components/ui/ConfirmDialog.tsx
//
// 2026-09-01: the app used the browser's own native window.confirm()/
// window.prompt() in 12 places for "are you sure?" and "why are you
// cancelling this?" moments. Those are OS/browser chrome, not part of
// the page - the dialog itself is titled with the page's raw hosting
// address (e.g. "coredigitaltools-collab.github.io says"), which is a
// browser security measure no website's JavaScript can override or
// relabel. Reported live: a business owner seeing an unfamiliar
// external name on what should read as their own system, ImageCare,
// asking them something. There's no way to fix that by changing text -
// the fix is to stop using the native dialog at all and show the app's
// own modal instead, which can say whatever this app wants it to and
// looks like the rest of the app rather than a raw OS popup.
//
// This is a drop-in replacement for both native calls:
//   window.confirm('Delete this?')            -> a plain confirm dialog
//   window.prompt('Reason for this refund?')  -> a confirm dialog with a
//                                                 required reason field
// Rendered exactly like every other dialog in the app (via Modal), at
// the smallest/default size - right for a short confirmation, never
// meant to carry a long form.
// ============================================================

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  // When set, the dialog collects a short required reason before
  // confirming (replaces window.prompt()'s single text input) instead
  // of a plain yes/no (replaces window.confirm()).
  reasonLabel?: string
  reasonPlaceholder?: string
  onConfirm: (reason?: string) => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  reasonLabel,
  reasonPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('')
  const needsReason = Boolean(reasonLabel)
  const canConfirm = !needsReason || reason.trim().length > 0

  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-ink-700">{message}</p>

      {needsReason && (
        <div className="mt-4">
          <label htmlFor="confirm-dialog-reason" className="mb-1 block text-xs font-medium text-ink-500">
            {reasonLabel}
          </label>
          <textarea
            id="confirm-dialog-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={3}
            autoFocus
            className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={() => onConfirm(needsReason ? reason.trim() : undefined)}
          disabled={!canConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
