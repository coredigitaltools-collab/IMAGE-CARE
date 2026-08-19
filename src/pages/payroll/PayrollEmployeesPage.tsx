import { useState } from 'react'
import { Archive, Plus, Users } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PayrollTabs } from '../../components/payroll/PayrollTabs'
import { AddEmployeeToPayrollModal } from '../../components/payroll/AddEmployeeToPayrollModal'
import { AssignComponentModal } from '../../components/payroll/AssignComponentModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useStaff } from '../../features/settings/hooks/useSettingsData'
import { formatCurrency } from '../../lib/format'
import {
  useAddEmployeeToPayroll,
  useAssignComponent,
  useAssignments,
  useComponentTypes,
  usePayrollEmployees,
  useRemoveAssignment,
  useRemoveFromPayroll,
} from '../../features/payroll/hooks/usePayrollData'
import type { PayrollEmployeeRecord } from '../../types/payroll'

export function PayrollEmployeesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const staffQuery = useStaff()
  const employeesQuery = usePayrollEmployees()
  const allowanceTypesQuery = useComponentTypes('allowance')
  const deductionTypesQuery = useComponentTypes('deduction')
  const assignmentsQuery = useAssignments()
  const addEmployee = useAddEmployeeToPayroll(user.id)
  const removeEmployee = useRemoveFromPayroll(user.id)
  const assignComponent = useAssignComponent()
  const removeAssignment = useRemoveAssignment()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | undefined>()
  const [assigningFor, setAssigningFor] = useState<{ employee: PayrollEmployeeRecord; kind: 'allowance' | 'deduction' } | null>(null)

  const activeEmployees = (employeesQuery.data ?? []).filter((e) => e.is_active)
  const staffName = (staffId: string) => staffQuery.data?.find((s) => s.id === staffId)?.fullName ?? 'Unknown staff'
  const eligibleStaff = (staffQuery.data ?? []).filter((s) => s.is_active && !activeEmployees.some((e) => e.staffId === s.id))

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Payroll' }]} />
      <PayrollTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Employees</h1>
          <p className="mt-0.5 text-sm text-ink-500">Staff on payroll, with their base salary and assigned allowances/deductions.</p>
        </div>
        <Button
          onClick={() => {
            setAddError(undefined)
            setIsAddOpen(true)
          }}
        >
          <Plus size={15} /> Add to payroll
        </Button>
      </div>

      <Card className="p-5">
        {employeesQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : activeEmployees.length === 0 ? (
          <EmptyState icon={Users} title="No employees on payroll yet" description="Add staff from your Staff Master to start running payroll." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {activeEmployees.map((emp) => {
              const empAssignments = (assignmentsQuery.data ?? []).filter((a) => a.employeeRecordId === emp.id)
              return (
                <li key={emp.id} className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{staffName(emp.staffId)}</p>
                      <p className="text-xs text-ink-500">Base salary {formatCurrency(emp.baseSalaryUgx, 'UGX')}</p>
                    </div>
                    <RowActionButton
                      icon={Archive}
                      label="Remove from payroll"
                      tone="danger"
                      onClick={async () => {
                        await removeEmployee.mutateAsync(emp.id)
                        showToast('Removed from payroll.', 'success')
                      }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {empAssignments.map((a) => {
                      const type = [...(allowanceTypesQuery.data ?? []), ...(deductionTypesQuery.data ?? [])].find((t) => t.id === a.componentTypeId)
                      return (
                        <Badge key={a.id} tone={a.kind === 'allowance' ? 'success' : 'danger'}>
                          <button
                            onClick={async () => {
                              await removeAssignment.mutateAsync(a.id)
                            }}
                            className="flex items-center gap-1"
                            title="Click to remove"
                          >
                            {type?.name ?? 'Unknown'} ✕
                          </button>
                        </Badge>
                      )
                    })}
                    <button
                      onClick={() => setAssigningFor({ employee: emp, kind: 'allowance' })}
                      className="rounded-full border border-dashed border-ink-300 px-2 py-0.5 text-xs text-ink-500 hover:bg-ink-50"
                    >
                      + Allowance
                    </button>
                    <button
                      onClick={() => setAssigningFor({ employee: emp, kind: 'deduction' })}
                      className="rounded-full border border-dashed border-ink-300 px-2 py-0.5 text-xs text-ink-500 hover:bg-ink-50"
                    >
                      + Deduction
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <AddEmployeeToPayrollModal
          eligibleStaff={eligibleStaff}
          submitError={addError}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (staffId, baseSalaryUgx) => {
            try {
              await addEmployee.mutateAsync({ staffId, baseSalaryUgx })
              showToast('Added to payroll.', 'success')
              setIsAddOpen(false)
            } catch (err) {
              setAddError(err instanceof Error ? err.message : 'Could not add this employee.')
            }
          }}
        />
      )}

      {assigningFor && (
        <AssignComponentModal
          kind={assigningFor.kind}
          availableTypes={(assigningFor.kind === 'allowance' ? allowanceTypesQuery.data : deductionTypesQuery.data) ?? []}
          onClose={() => setAssigningFor(null)}
          onSubmit={async (componentTypeId, amountOverride) => {
            await assignComponent.mutateAsync({ employeeRecordId: assigningFor.employee.id, componentTypeId, kind: assigningFor.kind, amountOverride })
            showToast(`${assigningFor.kind === 'allowance' ? 'Allowance' : 'Deduction'} assigned.`, 'success')
            setAssigningFor(null)
          }}
        />
      )}
    </div>
  )
}
