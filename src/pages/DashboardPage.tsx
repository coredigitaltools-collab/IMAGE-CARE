import { useMemo, useState } from 'react'
import { WelcomeHeader } from '../components/dashboard/WelcomeHeader'
import { BranchSelector } from '../components/dashboard/BranchSelector'
import { CurrencySelector } from '../components/dashboard/CurrencySelector'
import { SyncStatusIndicator } from '../components/dashboard/SyncStatusIndicator'
import { KpiGrid } from '../components/dashboard/KpiGrid'
import { QuickActions } from '../components/dashboard/QuickActions'
import { LowStockAlert } from '../components/dashboard/LowStockAlert'
import { RecentSalesList } from '../components/dashboard/RecentSalesList'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../hooks/useAuth'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useToast } from '../components/ui/Toast'
import { BRANCHES } from '../data/mockData'
import type { SupportedCurrency } from '../lib/currency'
import { useDashboardSummary, useLowStockItems, useRecentSales, useSyncStatus } from '../features/dashboard/hooks/useDashboardData'

const MODULE_LABELS: Record<'sale' | 'purchase' | 'expense' | 'reports', string> = {
  sale: 'Sales',
  purchase: 'Purchase Orders',
  expense: 'Expenses',
  reports: 'Monthly Summary',
}

export function DashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isOnline = useOnlineStatus()

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
  const syncQuery = useSyncStatus()

  const handleQuickAction = (target: 'sale' | 'purchase' | 'expense' | 'reports') => {
    showToast(`${MODULE_LABELS[target]} isn't built yet — coming in a future implementation pack.`)
  }

  return (
    <AppShell
      topbarRight={
        <>
          <BranchSelector
            branches={visibleBranches}
            selectedBranchId={selectedBranchId}
            onChange={setSelectedBranchId}
          />
          <CurrencySelector selected={reportingCurrency} onChange={setReportingCurrency} />
          <SyncStatusIndicator status={isOnline ? syncQuery.data : { state: 'offline', lastSyncedAt: syncQuery.data?.lastSyncedAt ?? null, pendingCount: 0 }} />
        </>
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <WelcomeHeader userName={user.name} businessName={user.businessName} />

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
    </AppShell>
  )
}
