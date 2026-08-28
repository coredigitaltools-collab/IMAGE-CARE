import { Link } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PayrollTabs } from '../../components/payroll/PayrollTabs'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { usePayrollPeriods, usePayslips } from '../../features/payroll/hooks/usePayrollData'
import { PAYROLL_STATUS_LABELS } from '../../types/payroll'

const STATUS_TONE = { draft: 'neutral', calculated: 'warning', approved: 'info', paid: 'success', archived: 'neutral' } as const

export function PayrollReportsPage() {
  const periodsQuery = usePayrollPeriods()
  const payslipsQuery = usePayslips()

  const settledPeriods = (periodsQuery.data ?? []).filter((p) => p.status === 'paid' || p.status === 'archived')
  const costByPeriod = settledPeriods.map((period) => {
    const lines = (payslipsQuery.data ?? []).filter((p) => p.periodId === period.id)
    return { period, totalNetPay: lines.reduce((sum, l) => sum + l.netPay, 0), employeeCount: lines.length }
  })

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Payroll' }]} />
      <PayrollTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Payroll Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Cost per payroll period, for periods that have actually been paid.</p>
      </div>

      <Card className="p-5">
        {periodsQuery.isLoading || payslipsQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : costByPeriod.length === 0 ? (
          <EmptyState icon={BarChart3} title="No paid payroll periods yet" description="This fills in once a payroll period is fully paid." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {costByPeriod.map(({ period, totalNetPay, employeeCount }) => (
              <li key={period.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <Link to={`/payroll/periods/${period.id}`} className="font-medium text-ink-900 hover:text-brand-blue-700">
                      {period.reference}
                    </Link>
                    <Badge tone={STATUS_TONE[period.status]}>{PAYROLL_STATUS_LABELS[period.status]}</Badge>
                  </div>
                  <p className="text-xs text-ink-500">
                    {employeeCount} employee{employeeCount === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="font-semibold text-ink-900">{formatCurrency(totalNetPay, 'UGX')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
