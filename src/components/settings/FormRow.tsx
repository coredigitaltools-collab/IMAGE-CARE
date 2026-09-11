import type { ReactNode } from 'react'

interface FormRowProps {
  children: ReactNode
}

// Shared two-column field row for multi-field dialogs (customer, supplier,
// branch, staff forms, etc.). Stacks to a single column on narrow viewports
// (mobile/small windows) and pairs up from `sm:` upward - the same
// grid-cols-2 pattern a handful of forms already used ad hoc for their one
// numeric pair, now available as one component so every retrofitted form
// uses the exact same gap/breakpoint instead of a slightly different
// one-off className each time.
export function FormRow({ children }: FormRowProps) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}
