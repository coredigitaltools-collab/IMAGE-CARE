import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  Receipt,
  BadgeDollarSign,
  TrendingDown,
  PiggyBank,
  Wallet,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { OfflineModeTabs } from '../../components/offlineMode/OfflineModeTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toastContext'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useOfflineDashboardKpis, usePerformManualSync } from '../../features/offlineMode/hooks/useOfflineModeData'

export function OfflineStatusDashboardPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [currency] = useState<'UGX'>('UGX')
  const kpisQuery = useOfflineDashboardKpis(currency)
  const performSync = usePerformManualSync()
  const data = kpisQuery.data

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Offline Mode' }]} />
      <OfflineModeTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Offline Status</h1>
          <p className="mt-0.5 text-sm text-ink-500">Business operations keep working with no connection; this is what's waiting to sync.</p>
        </div>
        <Button
          onClick={async () => {
            const result = await performSync.mutateAsync()
            showToast(result.itemCount === 0 ? 'Nothing to sync.' : `Synced ${result.itemCount} item${result.itemCount === 1 ? '' : 's'}.`, 'success')
          }}
        >
          <RefreshCw size={14} /> Sync now
        </Button>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Financial summary</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Sales" value={data ? formatCurrency(data.salesUgx, 'UGX') : '-'} icon={TrendingUp} tone="blue" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="COGS"
          value={data ? formatCurrency(data.cogsUgx, 'UGX') : '-'}
          hint="Cost of goods sold"
          icon={Receipt}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Gross profit"
          value={data ? formatCurrency(data.grossProfitUgx, 'UGX') : '-'}
          icon={BadgeDollarSign}
          tone={data && data.grossProfitUgx >= 0 ? 'success' : 'red'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard label="Expenses" value={data ? formatCurrency(data.expensesUgx, 'UGX') : '-'} icon={TrendingDown} tone="neutral" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="Net profit"
          value={data ? formatCurrency(data.netProfitUgx, 'UGX') : '-'}
          icon={PiggyBank}
          tone={data && data.netProfitUgx >= 0 ? 'success' : 'red'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard label="Cash in hand" value={data ? formatCurrency(data.cashInHandUgx, 'UGX') : '-'} icon={Wallet} tone="blue" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="Outstanding credit"
          value={data ? formatCurrency(data.outstandingCreditUgx, 'UGX') : '-'}
          icon={CreditCard}
          tone={data && data.outstandingCreditUgx > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Low stock alerts"
          value={data ? String(data.lowStockCount) : '-'}
          icon={AlertTriangle}
          tone={data && data.lowStockCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Sync status</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button onClick={() => navigate('/offline-mode/queue')} className="text-left">
          <KpiCard
            label="Pending sync items"
            value={data ? String(data.pendingSyncCount) : '-'}
            icon={RefreshCw}
            tone={data && data.pendingSyncCount > 0 ? 'red' : 'success'}
            isLoading={kpisQuery.isLoading}
          />
        </button>
        <button onClick={() => navigate('/offline-mode/history')} className="text-left">
          <KpiCard
            label="Last successful sync"
            value={data?.lastSuccessfulSyncAt ? formatRelativeTime(data.lastSuccessfulSyncAt) : 'Never'}
            icon={CheckCircle2}
            tone="neutral"
            isLoading={kpisQuery.isLoading}
          />
        </button>
      </div>
    </div>
  )
}
