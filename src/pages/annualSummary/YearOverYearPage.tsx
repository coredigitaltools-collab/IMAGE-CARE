import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { AnnualSummaryTabs } from '../../components/annualSummary/AnnualSummaryTabs'
import { YearPicker } from '../../components/annualSummary/YearPicker'
import { useSelectedYear } from '../../components/annualSummary/useSelectedYear'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import { useYearOverYearComparison } from '../../features/annualSummary/hooks/useAnnualSummaryData'

const ROWS: { key: 'salesUgx' | 'cogsUgx' | 'grossProfitUgx' | 'expensesUgx' | 'netProfitUgx'; label: string }[] = [
  { key: 'salesUgx', label: 'Revenue' },
  { key: 'cogsUgx', label: 'COGS' },
  { key: 'grossProfitUgx', label: 'Gross Profit' },
  { key: 'expensesUgx', label: 'Operating Expenses' },
  { key: 'netProfitUgx', label: 'Net Profit' },
]

export function YearOverYearPage() {
  const [year, setYear] = useSelectedYear()
  const yoyQuery = useYearOverYearComparison(year)
  const data = yoyQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Annual Summary' }]} />
      <AnnualSummaryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Year over Year</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {data ? `${data.currentYear} compared to ${data.previousYear}` : 'Compared to the prior year.'}
          </p>
        </div>
        <YearPicker value={year} onChange={setYear} />
      </div>

      {yoyQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : data ? (
        <Card className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th className="pb-2 font-medium">Metric</th>
                <th className="pb-2 text-right font-medium">{data.previousYear}</th>
                <th className="pb-2 text-right font-medium">{data.currentYear}</th>
                <th className="pb-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const change = data.changePercent[row.key]
                return (
                  <tr key={row.key} className="border-t border-ink-100">
                    <td className="py-2.5 text-ink-900">{row.label}</td>
                    <td className="py-2.5 text-right text-ink-500">{formatCurrency(data.previous[row.key], 'UGX')}</td>
                    <td className="py-2.5 text-right font-medium text-ink-900">{formatCurrency(data.current[row.key], 'UGX')}</td>
                    <td className="py-2.5 text-right">
                      {change === null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                          <Minus size={12} /> No baseline
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${change >= 0 ? 'text-success-700' : 'text-brand-red-700'}`}
                        >
                          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {change >= 0 ? '+' : ''}
                          {change}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-ink-500">
            "No baseline" means {data.previousYear} had nothing to compare against for that figure, not a fabricated 0% or missing data hidden as
            zero.
          </p>
        </Card>
      ) : null}
    </div>
  )
}
