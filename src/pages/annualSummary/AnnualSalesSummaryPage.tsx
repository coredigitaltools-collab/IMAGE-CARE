import { TrendingUp } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { AnnualSummaryTabs } from '../../components/annualSummary/AnnualSummaryTabs'
import { YearPicker } from '../../components/annualSummary/YearPicker'
import { useSelectedYear } from '../../components/annualSummary/useSelectedYear'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useAnnualSalesSummary } from '../../features/annualSummary/hooks/useAnnualSummaryData'

export function AnnualSalesSummaryPage() {
  const [year, setYear] = useSelectedYear()
  const salesQuery = useAnnualSalesSummary(year)
  const data = salesQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Annual Summary' }]} />
      <AnnualSummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Annual Sales Summary</h1>
          <p className="mt-0.5 text-sm text-ink-500">Completed sales for {year}.</p>
        </div>
        <YearPicker value={year} onChange={setYear} />
      </div>

      {salesQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.transactionCount === 0 ? (
        <Card className="p-6">
          <EmptyState icon={TrendingUp} title="No sales this year" description="Completed sales for the selected year will appear here." />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs text-ink-500">Total sales</p>
              <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(data.totalSalesUgx, 'UGX')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Transactions</p>
              <p className="mt-1 text-lg font-semibold text-ink-900">{data.transactionCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Average sale</p>
              <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(data.averageSaleUgx, 'UGX')}</p>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Top selling products, {year}</h2>
            <ul className="divide-y divide-ink-100">
              {data.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-medium text-ink-500">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium text-ink-900">{p.productName}</p>
                      <p className="text-xs text-ink-500">{p.unitsSold} units sold</p>
                    </div>
                  </div>
                  <span className="font-semibold text-ink-900">{formatCurrency(p.revenueUgx, 'UGX')}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
