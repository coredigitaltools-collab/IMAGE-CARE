import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  // Rendered in a stable strip pinned to the bottom of the modal, below the
  // scrollable body - so primary/secondary actions (Save, Cancel, Complete
  // Sale, etc.) never scroll out of view on a long form. Optional: the many
  // short confirmation dialogs don't need it and can leave their action
  // buttons as the last thing in `children`, same as before.
  footer?: ReactNode
  // Most forms (a handful of fields, a confirmation) are comfortable at the
  // default width. A few workflows pack multiple 2-column field rows (e.g.
  // the customer/supplier/branch/staff forms) and were visibly cramped at
  // that width - 'lg' gives those forms the room their own grid-cols-2 rows
  // need, without changing the other call sites still using the default.
  // 'xl' is for the few multi-section workflows (e.g. Record Sale, Purchase
  // Order/Return line-item editors) that need real width to breathe.
  size?: 'md' | 'lg' | 'xl'
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ title, onClose, children, footer, size = 'md' }: ModalProps) {
  return (
    // z-index comes from the app's own design-system scale (globals.css)
    // rather than an arbitrary Tailwind z-*: the sidebar and header use
    // this same scale via var(--z-sticky)/var(--z-dropdown), and
    // var(--z-modal) already existed there for exactly this purpose but
    // this component was never wired to it. Without it, this modal (used
    // by every dialog in the app) painted at z-50, underneath the
    // sidebar's z-200 - so on any page the sidebar covered, part of every
    // modal's content rendered invisibly behind the sidebar rather than
    // on top of it.
    <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6" style={{ zIndex: 'var(--z-modal)' }}>
      <div className="absolute inset-0 bg-navy-900/50 backdrop-blur-[2px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} aria-hidden="true" />
      {/*
        Header/body/footer are a flex column capped at 90vh, with only the
        body (the field content) scrolling. Before this, every long-form
        dialog had to remember to add its own max-h/overflow-y-auto wrapper
        (some did, inconsistently; some didn't and just clipped). Doing it
        once here means every dialog - short or long - gets a header that
        stays put, a footer that stays put, and a body that scrolls exactly
        when it needs to. Comfortable px-6/py-5 padding replaces the old
        cramped p-5 wrapping everything in one box.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[90vh] w-full ${SIZE_CLASSES[size]} flex-col animate-[modalIn_180ms_ease-out] rounded-card border border-ink-100 bg-white shadow-card-hover`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-ink-100 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
