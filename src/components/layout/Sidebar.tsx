import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Users,
  CreditCard,
  Award,
  FileText,
  ClipboardList,
  Receipt,
  Wallet,
  FileMinus,
  BarChart3,
  Package,
  Landmark,
  CalendarDays,
  Calendar,
  Building2,
  Banknote,
  CloudOff,
  Settings,
  X,
} from 'lucide-react'

interface NavItem {
  label: string
  icon: LucideIcon
  available: boolean
}

// Full IMC-000 approved module list. Only Dashboard is implemented
// (IMP-001) — the rest render as disabled entries so the approved scope
// stays visible without implying those modules exist yet.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, available: true },
  { label: 'Inventory', icon: Boxes, available: false },
  { label: 'Sales', icon: ShoppingCart, available: false },
  { label: 'Clients', icon: Users, available: false },
  { label: 'Credit', icon: CreditCard, available: false },
  { label: 'Loyalty Programme', icon: Award, available: false },
  { label: 'Invoices', icon: FileText, available: false },
  { label: 'Purchase Orders', icon: ClipboardList, available: false },
  { label: 'Bills & Payables', icon: Receipt, available: false },
  { label: 'Payroll', icon: Wallet, available: false },
  { label: 'Expenses', icon: FileMinus, available: false },
  { label: 'Sales Targets', icon: BarChart3, available: false },
  { label: 'Stock Summary', icon: Package, available: false },
  { label: 'Cash Flow', icon: Landmark, available: false },
  { label: 'Monthly Summary', icon: CalendarDays, available: false },
  { label: 'Annual Summary', icon: Calendar, available: false },
  { label: 'Daily Summary', icon: Calendar, available: false },
  { label: 'Bank Reconciliation', icon: Banknote, available: false },
  { label: 'Branch Overview', icon: Building2, available: false },
  { label: 'Offline', icon: CloudOff, available: false },
  { label: 'Settings', icon: Settings, available: false },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col border-r border-ink-100 bg-white transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-ink-100 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue-700 text-sm font-bold text-white">
              IC
            </div>
            <span className="text-sm font-semibold text-ink-900">ImageCare</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink-500 hover:bg-ink-50 lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ label, icon: Icon, available }) => (
              <li key={label}>
                <button
                  disabled={!available}
                  aria-current={available ? 'page' : undefined}
                  title={available ? undefined : `${label} — coming in a future implementation pack`}
                  className={
                    available
                      ? 'flex w-full items-center gap-3 rounded-md bg-brand-blue-50 px-3 py-2 text-sm font-medium text-brand-blue-700'
                      : 'flex w-full cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-300'
                  }
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  {!available && (
                    <span className="ml-auto shrink-0 rounded-full bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                      Soon
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  )
}
