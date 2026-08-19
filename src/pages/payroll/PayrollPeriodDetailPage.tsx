import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Archive, Calculator, CheckCircle2, FileText, Send, Wallet } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import {
  useApprovePeriod,
  useArchivePeriod,
  useCalculatePayroll,
  useMarkPayslipsGenerated,
  usePayrollPeriod,
  usePayslips,
  useRecordPayrollPayment,
} from '../../features/payroll/hooks/usePayrollData'
import { InvalidPeriodTransitionError, NoEmployeesInPayrollError, PayrollLockedError } from '../../services/payrollService'
import { PAYROLL_STATUS_LABELS } from '../../types/payroll'

const STATUS_TONE = { draft: 'neutral', calculated: 'warning', approved: 'info', paid: 'success', archived: 'neutral' } as const

export function PayrollPeriodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()

  const periodQuery = usePayrollPeriod(id)
  const payslipsQuery = usePayslips(id)
  const calculate = useCalculatePayroll()
  const approve = useApprovePeriod(user.name)
  const markGenerated = useMarkPayslipsGenerated()
  const recordPayment = useRecordPayrollPayment()
  const archive = useArchivePeriod()

  const [actionError, setActionError] = useState<string | undefined>()

  const period = periodQuery.data

  if (periodQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  if (!period) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState icon={FileText} title="Payroll period not found" description="It may have been removed." />
      </div>
    )
  }

  const payslips = payslipsQuery.data ?? []
  const totalNetPay = payslips.reduce((sum, p) => sum + p.netPay, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsPageHeader
        title={period.reference}
        description={`${new Date(period.startDate).toLocaleDateString('en-UG')} – ${new Date(period.endDate).toLocaleDateString('en-UG')}`}
        action={
          <div className="flex flex-wrap gap-2">
            {(period.status === 'draft' || period.status === 'calculated') && (
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await calculate.mutateAsync(period.id)
                    showToast('Payroll calculated.', 'success')
                  } catch (err) {
                    setActionError(
                      err instanceof NoEmployeesInPayrollError || err instanceof PayrollLockedError ? err.message : 'Could not calculate payroll.',
                    )
                  }
                }}
              >
                <Calculator size={14} /> {period.status === 'draft' ? 'Calculate' : 'Recalculate'}
              </Button>
            )}
            {period.status === 'calculated' && (
              <Button
                onClick={async () => {
                  await approve.mutateAsync(period.id)
                  showToast('Payroll approved and locked.', 'success')
                }}
              >
                <CheckCircle2 size={14} /> Approve
              </Button>
            )}
            {period.status === 'approved' && !period.payslipsGeneratedAt && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await markGenerated.mutateAsync(period.id)
                  showToast('Payslips generated.', 'success')
                }}
              >
                <Send size={14} /> Generate payslips
              </Button>
            )}
            {period.status === 'approved' && (
              <Button
                onClick={async () => {
                  try {
                    await recordPayment.mutateAsync(period.id)
                    showToast('Payroll payment recorded.', 'success')
                  } catch (err) {
                    setActionError(err instanceof InvalidPeriodTransitionError ? err.message : 'Could not record payment.')
                  }
                }}
              >
                <Wallet size={14} /> Record payment
              </Button>
            )}
            {period.status === 'paid' && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await archive.mutateAsync(period.id)
                  showToast('Payroll archived.', 'success')
                }}
              >
                <Archive size={14} /> Archive
              </Button>
            )}
          </div>
        }
      />

      {actionError && <p className="mb-4 text-sm text-brand-red-700">{actionError}</p>}

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS_TONE[period.status]}>{PAYROLL_STATUS_LABELS[period.status]}</Badge>
        {period.approvedByName && <span className="text-xs text-ink-500">Approved by {period.approvedByName}</span>}
        {period.payslipsGeneratedAt && <span className="text-xs text-ink-500">Payslips generated</span>}
        {(period.status === 'approved' || period.status === 'paid' || period.status === 'archived') && (
          <span className="text-xs text-ink-500">Calculation locked</span>
        )}
      </div>

      {payslips.length > 0 && (
        <Card className="mb-4 p-5">
          <p className="text-xs text-ink-500">Total net pay</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{formatCurrency(totalNetPay, 'UGX')}</p>
          <p className="text-xs text-ink-500">
            {payslips.length} employee{payslips.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Payslips</h2>
        {payslips.length === 0 ? (
          <EmptyState icon={FileText} title="Not calculated yet" description="Run Calculate to generate a payslip for every employee on payroll." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {payslips.map((p) => (
              <li key={p.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink-900">{p.staffName}</p>
                  <p className="font-semibold text-ink-900">{formatCurrency(p.netPay, 'UGX')}</p>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  Base {formatCurrency(p.baseSalary, 'UGX')}
                  {p.allowances.length > 0 && ` · +${formatCurrency(p.allowances.reduce((s, a) => s + a.amount, 0), 'UGX')} allowances`}
                  {p.deductions.length > 0 && ` · -${formatCurrency(p.totalDeductions, 'UGX')} deductions`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
