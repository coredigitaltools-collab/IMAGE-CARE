import { Printer, Download } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { AnnualSummaryTabs } from '../../components/annualSummary/AnnualSummaryTabs'
import { YearPicker, useSelectedYear } from '../../components/annualSummary/YearPicker'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import {
  useAnnualBranchComparison,
  useAnnualCashFlowSummary,
  useAnnualFinancials,
  useAnnualSalesSummary,
  useCurrentSnapshotForAnnual,
} from '../../features/annualSummary/hooks/useAnnualSummaryData'

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function AnnualReportPage() {
  const [year, setYear] = useSelectedYear()
  const financialsQuery = useAnnualFinancials(year)
  const salesQuery = useAnnualSalesSummary(year)
  const cashFlowQuery = useAnnualCashFlowSummary(year)
  const branchesQuery = useAnnualBranchComparison(year)
  const snapshotQuery = useCurrentSnapshotForAnnual('UGX')

  const isLoading = financialsQuery.isLoading || salesQuery.isLoading || cashFlowQuery.isLoading || branchesQuery.isLoading || snapshotQuery.isLoading

  const handleExport = () => {
    const f = financialsQuery.data
    const s = salesQuery.data
    const c = cashFlowQuery.data
    const snap = snapshotQuery.data
    const rows: (string | number)[][] = [
      ['Annual Summary', year],
      [],
      ['Financial Performance (UGX)'],
      ['Annual Revenue', f?.salesUgx ?? 0],
      ['Annual COGS', f?.cogsUgx ?? 0],
      ['Gross Profit', f?.grossProfitUgx ?? 0],
      ['Operating Expenses', f?.expensesUgx ?? 0],
      ['Net Profit', f?.netProfitUgx ?? 0],
      [],
      ['Annual Sales Summary'],
      ['Total Sales', s?.totalSalesUgx ?? 0],
      ['Transactions', s?.transactionCount ?? 0],
      ['Average Sale', s?.averageSaleUgx ?? 0],
      [],
      ['Cash Flow Summary (UGX)'],
      ['Cash Received', c?.cashReceivedUgx ?? 0],
      ['Cash Paid Out', c?.cashPaidOutUgx ?? 0],
      ['Net Cash Flow', c?.netCashFlowUgx ?? 0],
      [],
      ['As Of Now (UGX)'],
      ['Cash in Hand', snap?.cashInHandUgx ?? 0],
      ['Outstanding Credit', snap?.outstandingCreditUgx ?? 0],
      ['Inventory Value', snap?.inventoryValueUgx ?? 0],
      [],
      ['Top Selling Products'],
      ['Product', 'Units Sold', 'Revenue (UGX)'],
      ...(s?.topProducts ?? []).map((p) => [p.productName, p.unitsSold, p.revenueUgx]),
      [],
      ['Branch Performance'],
      ['Branch', 'Transactions', 'Sales (UGX)'],
      ...(branchesQuery.data ?? []).map((b) => [b.branchName, b.transactionCount, b.salesUgx]),
    ]
    downloadCsv(`annual-summary-${year}.csv`, rows)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Annual Summary' }]} />
      <AnnualSummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Annual Report</h1>
          <p className="mt-0.5 text-sm text-ink-500">Everything above, combined for print or export.</p>
        </div>
        <div className="flex items-center gap-2">
          <YearPicker value={year} onChange={setYear} />
          <Button variant="secondary" onClick={handleExport}>
            <Download size={14} /> Export CSV
          </Button>
          <Button onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      <h1 className="mb-4 hidden text-xl font-semibold text-ink-900 print:block">Annual Summary, {year}</h1>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Financial Performance, {year}</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-500">Annual revenue</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.salesUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Annual COGS</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.cogsUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Gross profit</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.grossProfitUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Operating expenses</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.expensesUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Net profit</dt>
                <dd className="text-ink-900">{formatCurrency(financialsQuery.data?.netProfitUgx ?? 0, 'UGX')}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Annual Sales Summary</h2>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Total sales</dt>
                <dd className="text-ink-900">{formatCurrency(salesQuery.data?.totalSalesUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Transactions</dt>
                <dd className="text-ink-900">{salesQuery.data?.transactionCount ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Average sale</dt>
                <dd className="text-ink-900">{formatCurrency(salesQuery.data?.averageSaleUgx ?? 0, 'UGX')}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Cash Flow Summary</h2>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Cash received</dt>
                <dd className="text-ink-900">{formatCurrency(cashFlowQuery.data?.cashReceivedUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Cash paid out</dt>
                <dd className="text-ink-900">{formatCurrency(cashFlowQuery.data?.cashPaidOutUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Net cash flow</dt>
                <dd className="text-ink-900">{formatCurrency(cashFlowQuery.data?.netCashFlowUgx ?? 0, 'UGX')}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">As of now</h2>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Cash in hand</dt>
                <dd className="text-ink-900">{formatCurrency(snapshotQuery.data?.cashInHandUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Outstanding credit</dt>
                <dd className="text-ink-900">{formatCurrency(snapshotQuery.data?.outstandingCreditUgx ?? 0, 'UGX')}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Inventory value</dt>
                <dd className="text-ink-900">{formatCurrency(snapshotQuery.data?.inventoryValueUgx ?? 0, 'UGX')}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Top selling products</h2>
            <ul className="divide-y divide-ink-100 text-sm">
              {(salesQuery.data?.topProducts ?? []).slice(0, 5).map((p) => (
                <li key={p.productId} className="flex items-center justify-between py-2">
                  <span className="text-ink-900">{p.productName}</span>
                  <span className="text-ink-700">{formatCurrency(p.revenueUgx, 'UGX')}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Branch performance</h2>
            <ul className="divide-y divide-ink-100 text-sm">
              {(branchesQuery.data ?? []).map((b) => (
                <li key={b.branchId} className="flex items-center justify-between py-2">
                  <span className="text-ink-900">{b.branchName}</span>
                  <span className="text-ink-700">{formatCurrency(b.salesUgx, 'UGX')}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
