import type { LucideIcon } from 'lucide-react'

type RowActionTone = 'default' | 'danger' | 'success'

const TONE_CLASSES: Record<RowActionTone, string> = {
  default: 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
  danger: 'text-ink-500 hover:bg-brand-red-50 hover:text-brand-red-700',
  success: 'text-ink-500 hover:bg-success-100 hover:text-success-700',
}

interface RowActionButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  tone?: RowActionTone
}

/** The standard action-icon pattern for every list row across the app
 *  (Products, Customers, Categories, Brands, Units, Suppliers, Staff,
 *  Branches, ...), established once here so future modules reuse it
 *  instead of inventing a new row-actions style each time. */
export function RowActionButton({ icon: Icon, label, onClick, tone = 'default' }: RowActionButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 ${TONE_CLASSES[tone]}`}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  )
}
