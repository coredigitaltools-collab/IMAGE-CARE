import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  // Most forms (a handful of fields, a confirmation) are comfortable at the
  // default width. A few workflows pack multiple 2-column field rows (e.g.
  // the product add/edit forms) and were visibly cramped at that width -
  // 'lg' gives those forms the room their own grid-cols-2 rows need,
  // without changing the ~30 other call sites still using the default.
  size?: 'md' | 'lg'
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/50 backdrop-blur-[2px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${SIZE_CLASSES[size]} animate-[modalIn_180ms_ease-out] rounded-card border border-ink-100 bg-white p-5 shadow-card-hover`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
