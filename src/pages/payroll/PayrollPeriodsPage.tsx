import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PayrollTabs } from '../../components/payroll/PayrollTabs'
import { CreatePayrollPeriodModal } from '../../components/payroll/CreatePayrollPeriodModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useCreatePayrollPeriod, usePayrollPeriods } from '../../features/payroll/hooks/usePayrollData'
import { NoEmployeesInPayrollError, OverlappingPeriodError, PAYROLL_STATUS_LABELS } from '../../types/payroll'

const STATUS_TONE = { draft: 'neutral', calculated: 'warning', approved: 'info', paid: 'success', archived: 'neutral' } as const

export function PayrollPeriodsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const periodsQuery = usePayrollPeriods()
  const createPeriod = useCreatePayrollPeriod(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | undefined>()

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Payroll' }]} />
      <PayrollTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Payroll Runs</h1>
          <p className="mt-0.5 text-sm text-ink-500">Period → Calculate → Approve → Payslips → Pay → Archive.</p>
        </div>
        <Button
          onClick={() => {
            setAddError(undefined)
            setIsAddOpen(true)
          }}
        >
          <Plus size={15} /> New period
        </Button>
      </div>

      <Card className="p-5">
        {periodsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (periodsQuery.data ?? []).length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No payroll periods yet"
            description="Create your first payroll period to get started."
            action={{
              label: '+ New period',
              onClick: () => {
                setAddError(undefined)
                setIsAddOpen(true)
              },
            }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(periodsQuery.data ?? []).map((period) => (
              <li key={period.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link to={`/payroll/periods/${period.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                    {period.reference}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {new Date(period.startDate).toLocaleDateString('en-UG')} – {new Date(period.endDate).toLocaleDateString('en-UG')}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[period.status]}>{PAYROLL_STATUS_LABELS[period.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <CreatePayrollPeriodModal
          submitError={addError}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (startDate, endDate) => {
            try {
              const { skipped } = await createPeriod.mutateAsync({ startDate, endDate })
              showToast(
                skipped.length === 0
                  ? 'Payroll period created.'
                  : `Payroll period created. Skipped ${skipped.length} staff member${skipped.length === 1 ? '' : 's'}: ${skipped.join(', ')}.`,
                'success',
              )
              setIsAddOpen(false)
            } catch (err) {
              setAddError(
                err instanceof OverlappingPeriodError || err instanceof NoEmployeesInPayrollError
                  ? err.message
                  : 'Could not create this period.',
              )
            }
          }}
        />
      )}
    </div>
  )
}
