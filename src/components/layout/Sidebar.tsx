import type { LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
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
import { useBusinessProfile } from '../../features/settings/hooks/useSettingsData'

interface NavItem {
  label: string
  icon: LucideIcon
  to?: string
}

// Full IMC-000 approved module list. Dashboard (IMP-001) and Settings
// (IMP-002) are implemented; the rest render as disabled entries so the
// approved scope stays visible without implying those modules exist yet.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Inventory', icon: Boxes, to: '/inventory' },
  { label: 'Sales', icon: ShoppingCart, to: '/sales' },
  { label: 'Customers', icon: Users, to: '/customers' },
  { label: 'Credit', icon: CreditCard, to: '/credit' },
  { label: 'Loyalty Programme', icon: Award, to: '/loyalty' },
  { label: 'Invoices', icon: FileText, to: '/invoices' },
  { label: 'Purchasing', icon: ClipboardList, to: '/purchasing' },
  { label: 'Bills & Payables', icon: Receipt, to: '/bills' },
  { label: 'Payroll', icon: Wallet, to: '/payroll' },
  { label: 'Expenses', icon: FileMinus, to: '/expenses' },
  { label: 'Sales Targets', icon: BarChart3, to: '/sales-targets' },
  { label: 'Stock Summary', icon: Package, to: '/stock-summary' },
  { label: 'Cash Flow', icon: Landmark, to: '/cash-flow' },
  { label: 'Monthly Summary', icon: CalendarDays, to: '/monthly-summary' },
  { label: 'Annual Summary', icon: Calendar, to: '/annual-summary' },
  { label: 'Daily Summary', icon: Calendar, to: '/daily-summary' },
  { label: 'Bank Reconciliation', icon: Banknote, to: '/bank-reconciliation' },
  { label: 'Branch Overview', icon: Building2, to: '/branch-overview' },
  { label: 'Offline', icon: CloudOff, to: '/offline-mode' },
  { label: 'Settings', icon: Settings, to: '/settings' },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation()
  const businessProfileQuery = useBusinessProfile()

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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col bg-navy-800 shadow-sidebar transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue-500 text-[10px] font-bold tracking-tight text-white">
              IMC
            </div>
            <span className="truncate text-sm font-semibold text-white">
              {businessProfileQuery.data?.name ?? 'ImageCare'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ label, icon: Icon, to }) => {
              const available = Boolean(to)
              const isActive = to === '/' ? location.pathname === '/' : Boolean(to && location.pathname.startsWith(to))

              if (available && to) {
                return (
                  <li key={label}>
                    <Link
                      to={to}
                      onClick={onClose}
                      aria-current={isActive ? 'page' : undefined}
                      className={
                        isActive
                          ? 'flex w-full items-center gap-3 rounded-lg bg-brand-blue-500 px-3 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgb(0_0_0_/_0.2)] transition-colors duration-150'
                          : 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white'
                      }
                    >
                      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                )
              }

              return (
                <li key={label}>
                  <button
                    disabled
                    title={`${label}, coming in a future implementation pack`}
                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/30"
                  >
                    <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="truncate">{label}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                      Soon
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}
