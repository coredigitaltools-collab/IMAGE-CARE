import type { LucideIcon } from 'lucide-react'
import { ShoppingCart, Receipt, FileMinus, BarChart3 } from 'lucide-react'

interface QuickAction {
  label: string
  icon: LucideIcon
  onClick: () => void
}

interface QuickActionsProps {
  onNavigate: (target: 'sale' | 'purchase' | 'expense' | 'reports') => void
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const actions: QuickAction[] = [
    { label: 'New sale', icon: ShoppingCart, onClick: () => onNavigate('sale') },
    { label: 'New purchase', icon: Receipt, onClick: () => onNavigate('purchase') },
    { label: 'Log expense', icon: FileMinus, onClick: () => onNavigate('expense') },
    { label: 'View reports', icon: BarChart3, onClick: () => onNavigate('reports') },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map(({ label, icon: Icon, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className="group flex flex-col items-center gap-2 rounded-card border border-ink-100 bg-white px-3 py-4 text-center shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-colors group-hover:bg-brand-blue-700 group-hover:text-white">
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="text-xs font-medium text-ink-700">{label}</span>
        </button>
      ))}
    </div>
  )
}
