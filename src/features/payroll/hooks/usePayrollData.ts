import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as payrollService from '../../../services/payrollService'
import * as payrollPeriodService from '../../../services/payroll/payrollPeriodService'
import { useUserContext } from '../../../context/AppContext'
import { listPayroll } from '../../../services/financial/financialServices'
import { APP_CONSTANTS } from '../../../config/env'
import type { PayComponentTypeInput, PayrollEmployeeInput } from '../../../types/payroll'
import type { PayrollRecord } from '../../../types/database'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payroll'] })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error')
  const d = r.data
  if (d === null || d === undefined) return []
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items
  return d
}

// PERIOD LIFECYCLE: fully real, on imagecare.payroll.
//
// A period is the set of imagecare.payroll rows sharing
// business_id + pay_period_start + pay_period_end (there is no
// payroll_periods table and none is invented). Create inserts one real
// row per active employee, costed from that employee's real
// imagecare.users.salary; Calculate re-costs those rows from the
// current salaries; Approve and Record payment delegate to the already
// real approvePayroll()/processPayrollPayment(); Generate payslips and
// Archive are real updates on the same rows. See
// services/payroll/payrollPeriodService.ts for the full status model.
//
// Still local, and deliberately out of scope here: the payroll employee
// register, the allowance/deduction catalogue and its per-employee
// assignments. Those have no table in the real schema at all (see
// docs/MODULE_INTEGRATION_MAP.md gap), which is why the real rows carry
// zero allowances/deductions rather than invented ones.

// ---------- Employees ----------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function usePayrollEmployees() {
  return useQuery({ queryKey: ['payroll', 'employees'], queryFn: payrollService.listPayrollEmployees })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap).
// staffId is still validated against the REAL staff list (imagecare.users)
// inside addEmployeeToPayroll, which is why ctx is needed here too.
export function useAddEmployeeToPayroll(userId: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PayrollEmployeeInput) => payrollService.addEmployeeToPayroll(ctx, input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useUpdateEmployeeSalary(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, baseSalaryUgx }: { id: string; baseSalaryUgx: number }) => payrollService.updateEmployeeSalary(id, baseSalaryUgx, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useRemoveFromPayroll(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => payrollService.removeFromPayroll(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Component types (Allowances / Deductions) ----------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useComponentTypes(kind?: 'allowance' | 'deduction') {
  return useQuery({ queryKey: ['payroll', 'component-types', kind ?? 'all'], queryFn: () => payrollService.listComponentTypes(kind) })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCreateComponentType(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, input }: { kind: 'allowance' | 'deduction'; input: PayComponentTypeInput }) =>
      payrollService.createComponentType(kind, input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useArchiveComponentType(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => payrollService.archiveComponentType(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Assignments ----------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useAssignments(employeeRecordId?: string) {
  return useQuery({ queryKey: ['payroll', 'assignments', employeeRecordId ?? 'all'], queryFn: () => payrollService.listAssignments(employeeRecordId) })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useAssignComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      employeeRecordId,
      componentTypeId,
      kind,
      amountOverride,
    }: {
      employeeRecordId: string
      componentTypeId: string
      kind: 'allowance' | 'deduction'
      amountOverride: number | null
    }) => payrollService.assignComponent(employeeRecordId, componentTypeId, kind, amountOverride),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useRemoveAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => payrollService.removeAssignment(id),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Periods ----------

// REAL: imagecare.payroll rows grouped into periods.
export function usePayrollPeriods() {
  const ctx = useUserContext()
  return useQuery({ queryKey: ['payroll', 'periods', ctx.business_id], queryFn: () => payrollPeriodService.listPeriods(ctx) })
}

// REAL: imagecare.payroll
export function usePayrollPeriod(id: string | undefined) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['payroll', 'period', ctx.business_id, id ?? 'none'],
    queryFn: () => payrollPeriodService.getPeriod(ctx, id as string),
    enabled: Boolean(id),
  })
}

// REAL: inserts one imagecare.payroll row per active employee, costed
// from that employee's real imagecare.users.salary. Resolves with the
// created period plus the active staff who had to be skipped (no salary
// or no branch), so the caller can say who was left out.
export function useCreatePayrollPeriod(userId: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) =>
      payrollPeriodService.createPeriod(ctx, startDate, endDate, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// REAL: the period's imagecare.payroll rows, one payslip line each.
export function usePayslips(periodId?: string) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['payroll', 'payslips', ctx.business_id, periodId ?? 'all'],
    queryFn: () => payrollPeriodService.listPayslips(ctx, periodId),
  })
}

// REAL: re-costs the period's rows from current salaries, then moves
// them to the table's native 'pending' (= calculated) status.
export function useCalculatePayroll() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollPeriodService.calculatePayroll(ctx, periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

// REAL: approvePayroll() (financialServices) per row.
export function useApprovePeriod(approverName: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollPeriodService.approvePeriod(ctx, periodId, approverName),
    onSuccess: () => invalidateAll(qc),
  })
}

// REAL: stamps metadata.payslips_generated_at on the period's rows.
export function useMarkPayslipsGenerated() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollPeriodService.markPayslipsGenerated(ctx, periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

// REAL: processPayrollPayment() (financialServices -> businessEngine)
// per row, which posts the journal entry and cash outflow per employee.
export function useRecordPayrollPayment() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollPeriodService.recordPayrollPayment(ctx, periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

// REAL: status update on the period's rows.
export function useArchivePeriod() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollPeriodService.archivePeriod(ctx, periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePayrollDashboardKpis() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['payroll', 'kpis', ctx.business_id],
    queryFn: async () => {
      // Largest page allowed: one payroll row is one employee for one
      // period, so the default 50-row page would have covered only the
      // last couple of periods once real per-employee rows exist, and
      // the YTD cost would silently under-report. Rows come back newest
      // pay_date first, so this reads the most recent 200.
      const items = (await listPayroll(ctx, {}, { page_size: APP_CONSTANTS.MAX_PAGE_SIZE }).then(unwrap)) as PayrollRecord[]

      const activeEmployeeCount = new Set(
        items.filter((r) => r.status !== 'cancelled' && r.status !== 'archived').map((r) => r.user_id),
      ).size

      const sortedByDate = [...items].sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime())
      const currentPeriodStatus = sortedByDate.length > 0 ? payrollPeriodService.rowStatusToPeriodStatus(sortedByDate[0].status) : null

      // 'pending' is the calculated-but-not-yet-approved state.
      const pendingApprovalCount = items.filter((r) => r.status === 'pending').length

      // An archived period was paid - it still counts towards the last
      // payroll paid and the YTD payroll cost.
      const paidItems = items.filter((r) => r.status === 'paid' || r.status === 'archived')
      const lastPaidDate = paidItems.reduce<string | null>((latest, r) => (!latest || r.pay_date > latest ? r.pay_date : latest), null)
      const lastPaidBatch = lastPaidDate ? paidItems.filter((r) => r.pay_date === lastPaidDate) : []
      const lastPaidAmountUgx = lastPaidBatch.reduce((sum, r) => sum + r.net_pay, 0)
      const lastPaidAt = lastPaidBatch[0]?.updated_at ?? null

      const currentYear = new Date().getFullYear()
      const ytdPayrollCostUgx = paidItems
        .filter((r) => new Date(r.pay_date).getFullYear() === currentYear)
        .reduce((sum, r) => sum + r.net_pay, 0)

      return {
        activeEmployeeCount,
        currentPeriodStatus,
        pendingApprovalCount,
        lastPaidAmountUgx,
        lastPaidAt,
        ytdPayrollCostUgx,
      }
    },
  })
}
