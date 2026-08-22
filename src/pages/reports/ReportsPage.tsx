// ============================================================
// ImageCare ERP - Reports Hub
// File: src/pages/reports/ReportsPage.tsx
// Stage 5: Central reports page - real backend data across all modules.
// ============================================================

import { useState } from 'react'
import { BarChart3, ShoppingCart, Package, DollarSign, CreditCard, TrendingUp } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import { useUserContext, useActiveBranch } from '../../context/AppContext'
import { useSales } from '../../features/sales/hooks/useSalesData'
import { useQuery } from '@tanstack/react-query'
import { getPLSummary } from '../../services/reporting/reportingService'
import { useInventoryKpis, useLowStockItems } from '../../features/inventory/hooks/useInventoryData'
import { useExpenseDashboardKpis, useSpendByCategory } from '../../features/expenses/hooks/useExpensesData'
// Note: getPLSummary imported above
import { usePurchaseDashboardKpis } from '../../features/purchasing/hooks/usePurchasingData'
import { useCreditDashboardKpis, useOutstandingCredit } from '../../features/credit/hooks/useCreditData'

const REPORT_TABS = ['Overview', 'Sales', 'Inventory', 'Purchases', 'Expenses', 'Credit'] as const
type ReportTab = typeof REPORT_TABS[number]

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-base font-semibold text-ink-900">{children}</h2>
}

function StatRow({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'red' }) {
  const cls = tone === 'green' ? 'text-green-700 font-semibold' : tone === 'red' ? 'text-red-700 font-semibold' : 'text-ink-900'
  return (
    <div className="flex items-center justify-between border-b border-ink-100 py-2 last:border-0">
      <span className="text-sm text-ink-600">{label}</span>
      <span className={`text-sm ${cls}`}>{value}</span>
    </div>
  )
}

function OverviewReport() {
  const invKpis     = useInventoryKpis()
  const purKpis     = usePurchaseDashboardKpis()
  const creditKpis  = useCreditDashboardKpis()
  const ctx         = useUserContext()
  const branch      = useActiveBranch()

  // Real P&L from journal_lines: Revenue (4000), COGS (5000), Expenses (6000)
  const plQuery = useQuery({
    queryKey: ['reports', 'pl-summary', ctx.business_id, branch],
    queryFn: () => getPLSummary(ctx, branch ?? undefined).then(r => {
      if (r.error) throw new Error(r.error.message ?? 'Failed to load P&L');
      return r.data!;
    }),
    refetchInterval: 60_000,
  })

  const pl = plQuery.data
  const revenue    = pl?.revenue    ?? 0
  const cogs       = pl?.cogs       ?? 0
  const expTotal   = pl?.expenses   ?? 0
  const grossProfit = pl?.grossProfit ?? 0
  const netProfit   = pl?.netProfit   ?? 0

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <div className="p-4">
          <SectionHeading>Profit and Loss</SectionHeading>
          {plQuery.isLoading
            ? <Skeleton className="h-48 w-full" />
            : <>
                <StatRow label="Revenue (4000)"       value={formatCurrency(revenue, 'UGX')}     tone="green" />
                <StatRow label="COGS (5000)"          value={formatCurrency(cogs, 'UGX')}        tone="red" />
                <StatRow label="Gross Profit"         value={formatCurrency(grossProfit, 'UGX')} tone={grossProfit >= 0 ? 'green' : 'red'} />
                <StatRow label="Expenses (6000)"      value={formatCurrency(expTotal, 'UGX')}    tone="red" />
                <StatRow label="Net Profit"           value={formatCurrency(netProfit, 'UGX')}   tone={netProfit >= 0 ? 'green' : 'red'} />
                <StatRow label="Outstanding Credit"   value={formatCurrency(creditKpis.data?.totalOutstandingUgx ?? 0, 'UGX')} />
              </>}
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <SectionHeading>Inventory</SectionHeading>
          {invKpis.isLoading ? <Skeleton className="h-40 w-full" /> : <>
            <StatRow label="Inventory Value"   value={formatCurrency(invKpis.data?.inventoryValue ?? 0, 'UGX')} />
            <StatRow label="Total Products"    value={String(invKpis.data?.totalProducts ?? 0)} />
            <StatRow label="Low Stock Items"   value={String(invKpis.data?.lowStockCount ?? 0)}  tone={(invKpis.data?.lowStockCount ?? 0) > 0 ? 'red' : 'default'} />
            <StatRow label="Out of Stock"      value={String(invKpis.data?.outOfStockCount ?? 0)} tone={(invKpis.data?.outOfStockCount ?? 0) > 0 ? 'red' : 'default'} />
          </>}
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <SectionHeading>Purchasing</SectionHeading>
          {purKpis.isLoading ? <Skeleton className="h-32 w-full" /> : <>
            <StatRow label="Total Orders"        value={String(purKpis.data?.total_orders ?? 0)} />
            <StatRow label="Pending"             value={String(purKpis.data?.pending_orders ?? 0)} />
            <StatRow label="Spend This Month"    value={formatCurrency(purKpis.data?.spendThisMonthUgx ?? 0, 'UGX')} />
            <StatRow label="Outstanding Payables" value={formatCurrency(purKpis.data?.outstanding_payables ?? 0, 'UGX')} />
          </>}
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <SectionHeading>Credit</SectionHeading>
          {creditKpis.isLoading ? <Skeleton className="h-32 w-full" /> : <>
            <StatRow label="Total Outstanding"      value={formatCurrency(creditKpis.data?.totalOutstandingUgx ?? 0, 'UGX')} />
            <StatRow label="Accounts with Balance"  value={String(creditKpis.data?.accountsWithBalance ?? 0)} />
            <StatRow label="Overdue"                value={String(creditKpis.data?.overdueAccounts ?? 0)} tone="red" />
          </>}
        </div>
      </Card>
    </div>
  )
}

function SalesReport() {
  const salesQuery = useSales()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmed  = (Array.isArray(salesQuery.data) ? salesQuery.data : []).filter((s: any) => s.status === 'confirmed')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revenue    = confirmed.reduce((sum: number, s: any) => sum + (s.total_amount ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byMethod   = confirmed.reduce((acc: Record<string, number>, s: any) => {
    const m = String(s.payment_method ?? 'unknown').replace(/_/g, ' ')
    acc[m] = (acc[m] ?? 0) + (s.total_amount ?? 0)
    return acc
  }, {})

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <div className="p-4">
          <SectionHeading>Sales Summary</SectionHeading>
          {salesQuery.isLoading ? <Skeleton className="h-40 w-full" /> : <>
            <StatRow label="Confirmed Sales"  value={String(confirmed.length)} />
            <StatRow label="Total Revenue"    value={formatCurrency(revenue, 'UGX')} tone="green" />
            {Object.entries(byMethod).map(([method, total]) => (
              <StatRow key={method} label={`  ${method}`} value={formatCurrency(total, 'UGX')} />
            ))}
          </>}
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <SectionHeading>Recent Sales</SectionHeading>
          {salesQuery.isLoading ? <Skeleton className="h-40 w-full" /> :
            confirmed.length === 0
              ? <p className="text-sm text-ink-400">No sales recorded yet.</p>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              : confirmed.slice(0, 10).map((s: any) => (
                  <StatRow key={s.id} label={s.sale_number ?? String(s.id).slice(0, 8)} value={formatCurrency(s.total_amount ?? 0, 'UGX')} />
                ))
          }
        </div>
      </Card>
    </div>
  )
}

function InventoryReport() {
  const invKpis  = useInventoryKpis()
  const lowStock = useLowStockItems()

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <div className="p-4">
          <SectionHeading>Inventory KPIs</SectionHeading>
          {invKpis.isLoading ? <Skeleton className="h-40 w-full" /> : <>
            <StatRow label="Total Products"   value={String(invKpis.data?.totalProducts ?? 0)} />
            <StatRow label="Inventory Value"  value={formatCurrency(invKpis.data?.inventoryValue ?? 0, 'UGX')} />
            <StatRow label="Potential Profit" value={formatCurrency(invKpis.data?.potentialProfit ?? 0, 'UGX')} tone="green" />
            <StatRow label="Low Stock"        value={String(invKpis.data?.lowStockCount ?? 0)}  tone={(invKpis.data?.lowStockCount ?? 0) > 0 ? 'red' : 'default'} />
            <StatRow label="Out of Stock"     value={String(invKpis.data?.outOfStockCount ?? 0)} tone={(invKpis.data?.outOfStockCount ?? 0) > 0 ? 'red' : 'default'} />
          </>}
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <SectionHeading>Low Stock Alerts</SectionHeading>
          {lowStock.isLoading ? <Skeleton className="h-40 w-full" /> :
            (lowStock.data ?? []).length === 0
              ? <p className="text-sm text-ink-400">All products adequately stocked.</p>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              : (lowStock.data ?? []).slice(0, 10).map((item: any, i: number) => (
                  <StatRow key={item.product_id ?? i}
                    label={item.product_name ?? item.name ?? 'Unknown'}
                    value={`${item.quantity_on_hand ?? 0} pcs (min ${item.reorder_level ?? 0})`}
                    tone="red"
                  />
                ))
          }
        </div>
      </Card>
    </div>
  )
}

function PurchasesReport() {
  const kpis = usePurchaseDashboardKpis()
  return (
    <Card>
      <div className="p-4">
        <SectionHeading>Purchasing Summary</SectionHeading>
        {kpis.isLoading ? <Skeleton className="h-40 w-full" /> : <>
          <StatRow label="Total Orders"          value={String(kpis.data?.total_orders ?? 0)} />
          <StatRow label="Pending (Draft)"        value={String(kpis.data?.pending_orders ?? 0)} />
          <StatRow label="Spend This Month"       value={formatCurrency(kpis.data?.spendThisMonthUgx ?? 0, 'UGX')} />
          <StatRow label="Outstanding Payables"   value={formatCurrency(kpis.data?.outstanding_payables ?? 0, 'UGX')} />
        </>}
      </div>
    </Card>
  )
}

function ExpensesReport() {
  const kpis       = useExpenseDashboardKpis()
  const byCategory = useSpendByCategory()
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <div className="p-4">
          <SectionHeading>Expense Summary</SectionHeading>
          {kpis.isLoading ? <Skeleton className="h-32 w-full" /> : <>
            <StatRow label="This Month"    value={formatCurrency(kpis.data?.totalThisMonthUgx ?? 0, 'UGX')} tone="red" />
            <StatRow label="Overall Total" value={formatCurrency(kpis.data?.totalOverall ?? 0, 'UGX')} />
          </>}
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <SectionHeading>Spend by Category</SectionHeading>
          {byCategory.isLoading ? <Skeleton className="h-32 w-full" /> :
            (byCategory.data ?? []).length === 0
              ? <p className="text-sm text-ink-400">No expense data yet.</p>
              : (byCategory.data ?? []).map(row => (
                  <StatRow key={row.category} label={row.category} value={formatCurrency(row.totalUgx, 'UGX')} />
                ))
          }
        </div>
      </Card>
    </div>
  )
}

function CreditReport() {
  const kpis       = useCreditDashboardKpis()
  const outstanding = useOutstandingCredit()
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <div className="p-4">
          <SectionHeading>Credit Summary</SectionHeading>
          {kpis.isLoading ? <Skeleton className="h-32 w-full" /> : <>
            <StatRow label="Total Outstanding"     value={formatCurrency(kpis.data?.totalOutstandingUgx ?? 0, 'UGX')} tone="red" />
            <StatRow label="Accounts with Balance" value={String(kpis.data?.accountsWithBalance ?? 0)} />
            <StatRow label="Overdue Accounts"      value={String(kpis.data?.overdueAccounts ?? 0)} tone="red" />
          </>}
        </div>
      </Card>
      <Card>
        <div className="p-4">
          <SectionHeading>Outstanding Balances</SectionHeading>
          {outstanding.isLoading ? <Skeleton className="h-32 w-full" /> :
            (outstanding.data ?? []).length === 0
              ? <p className="text-sm text-ink-400">No outstanding credit balances.</p>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              : (outstanding.data ?? []).slice(0, 10).map((item: any, i: number) => (
                  <StatRow key={item.customer_id ?? i}
                    label={item.customer_name ?? item.name ?? 'Customer'}
                    value={formatCurrency(item.outstanding ?? item.current_balance ?? 0, 'UGX')}
                    tone="red"
                  />
                ))
          }
        </div>
      </Card>
    </div>
  )
}

const TAB_ICONS: Record<ReportTab, React.ElementType> = {
  Overview:  BarChart3,
  Sales:     ShoppingCart,
  Inventory: Package,
  Purchases: TrendingUp,
  Expenses:  DollarSign,
  Credit:    CreditCard,
}

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('Overview')
  const ctx    = useUserContext()
  const branch = useActiveBranch()

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <BarChart3 size={24} className="text-brand-blue-600" />
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Reports</h1>
          <p className="text-sm text-ink-500">
            Live data from your backend.{' '}
            {branch ? 'Filtered to active branch.' : 'All branches.'}
            {` Business: ${ctx.business_id?.slice(0, 8) ?? ''}...`}
          </p>
        </div>
      </div>

      <nav className="mb-6 -mx-1 overflow-x-auto pb-1">
        <ul className="flex items-center gap-1 px-1">
          {REPORT_TABS.map(tab => {
            const Icon = TAB_ICONS[tab]
            return (
              <li key={tab} className="shrink-0">
                <button
                  onClick={() => setActiveTab(tab)}
                  className={
                    activeTab === tab
                      ? 'flex items-center gap-1.5 whitespace-nowrap rounded-md bg-brand-blue-50 px-3 py-1.5 text-sm font-medium text-brand-blue-700'
                      : 'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-900'
                  }
                >
                  <Icon size={14} />
                  {tab}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {activeTab === 'Overview'  && <OverviewReport />}
      {activeTab === 'Sales'     && <SalesReport />}
      {activeTab === 'Inventory' && <InventoryReport />}
      {activeTab === 'Purchases' && <PurchasesReport />}
      {activeTab === 'Expenses'  && <ExpensesReport />}
      {activeTab === 'Credit'    && <CreditReport />}
    </div>
  )
}

export default ReportsPage
