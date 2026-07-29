import { useMemo, useState } from 'react'
import { WelcomeHeader } from '../components/dashboard/WelcomeHeader'
import { BranchSelector } from '../components/dashboard/BranchSelector'
import { CurrencySelector } from '../components/dashboard/CurrencySelector'
import { KpiGrid } from '../components/dashboard/KpiGrid'
import { QuickActions } from '../components/dashboard/QuickActions'
import { LowStockAlert } from '../components/dashboard/LowStockAlert'
import { RecentSalesList } from '../components/dashboard/RecentSalesList'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/Toast'
import { BRANCHES } from '../data/mockData'
import type { SupportedCurrency } from '../lib/currency'
import { useDashboardSummary, useLowStockItems, useRecentSales } from '../features/dashboard/hooks/useDashboardData'
import { useBusinessProfile } from '../features/settings/hooks/useSettingsData'

const MODULE_LABELS: Record<'sale' | 'purchase' | 'expense' | 'reports', string> = {
  sale: 'Sales',
  purchase: 'Purchase Orders',
  expense: 'Expenses',
  reports: 'Monthly Summary',
}

export function DashboardPage() {
  const { user } = useAuth()
  const businessProfileQuery = useBusinessProfile()
  const { showToast } = useToast()

  // Business rule (IMP-001 §7): branch users see only branches they're
  // permitted to view. Owners/managers get every branch plus "All branches".
  const visibleBranches = useMemo(
    () => BRANCHES.filter((b) => user.allowedBranchIds.includes(b.id)),
    [user.allowedBranchIds],
  )
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all')
  const [reportingCurrency, setReportingCurrency] = useState<SupportedCurrency>('UGX')

  const summaryQuery = useDashboardSummary(selectedBranchId, reportingCurrency)
  const lowStockQuery = useLowStockItems(selectedBranchId)
  const recentSalesQuery = useRecentSales(selectedBranchId)

  const handleQuickAction = (target: 'sale' | 'purchase' | 'expense' | 'reports') => {
    showToast(`${MODULE_LABELS[target]} isn't built yet — coming in a future implementation pack.`)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <WelcomeHeader userName={user.name} businessName={businessProfileQuery.data?.businessName ?? 'ImageCare'} />
        <div className="flex items-center gap-3">
          <BranchSelector
            branches={visibleBranches}
            selectedBranchId={selectedBranchId}
            onChange={setSelectedBranchId}
          />
          <CurrencySelector selected={reportingCurrency} onChange={setReportingCurrency} />
        </div>
      </div>

      <QuickActions onNavigate={handleQuickAction} />

      <KpiGrid
        summary={summaryQuery.data}
        lowStock={lowStockQuery.data}
        isSummaryLoading={summaryQuery.isLoading}
        isLowStockLoading={lowStockQuery.isLoading}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RecentSalesList
          sales={recentSalesQuery.data}
          isLoading={recentSalesQuery.isLoading}
          isError={recentSalesQuery.isError}
          onRetry={() => recentSalesQuery.refetch()}
          onNewSale={() => handleQuickAction('sale')}
        />
        <LowStockAlert
          items={lowStockQuery.data}
          isLoading={lowStockQuery.isLoading}
          isError={lowStockQuery.isError}
          onRetry={() => lowStockQuery.refetch()}
        />
      </div>
    </div>
  )
}
