import { Link } from 'react-router-dom'
import { DollarSign, Layers, AlertTriangle, PackageX, Archive, TrendingUp, PieChart, History } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { StockSummaryTabs } from '../../components/stockSummary/StockSummaryTabs'
import { Card } from '../../components/ui/Card'

const REPORT_LINKS = [
  { label: 'Stock Valuation', description: 'What every product on hand is worth, at buying price.', to: '/inventory/reports', icon: DollarSign },
  { label: 'Stock Levels', description: 'Current stock for every active product.', to: '/inventory/reports', icon: Layers },
  { label: 'Low Stock', description: 'Products at or below their reorder level.', to: '/inventory/reports', icon: AlertTriangle },
  { label: 'Out of Stock', description: 'Products with zero units on hand.', to: '/inventory/reports', icon: PackageX },
  { label: 'Dead Stock', description: 'Products with no movement in a while.', to: '/inventory/reports', icon: Archive },
  { label: 'Fast / Slow Moving', description: 'Which products turn over quickly, and which sit.', to: '/inventory/reports', icon: TrendingUp },
  { label: 'Profitability', description: 'Margin per product, from buying to selling price.', to: '/inventory/reports', icon: PieChart },
  { label: 'Stock Movements', description: 'The full, permanent audit trail of every stock change.', to: '/inventory/movements', icon: History },
]

export function StockReportsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Stock Summary' }]} />
      <StockSummaryTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Stock Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">The full set of detailed inventory reports, in one place.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORT_LINKS.map(({ label, description, to, icon: Icon }) => (
          <Link key={label} to={to}>
            <Card className="flex items-start gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700">
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <span>
                <span className="block text-sm font-medium text-ink-900">{label}</span>
                <span className="block text-xs text-ink-500">{description}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
