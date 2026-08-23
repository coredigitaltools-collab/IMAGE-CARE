import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as payrollService from '../../../services/payrollService'
import { useUserContext } from '../../../context/AppContext'
import { getPayroll, listPayroll, approvePayroll, processPayrollPayment } from '../../../services/financial/financialServices'
import type { PayComponentTypeInput, PayrollEmployeeInput, PayrollPeriod, PayrollPeriodStatus } from '../../../types/payroll'
import type { PayrollRecord, UUID } from '../../../types/database'

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

// The real imagecare.payroll table is flat: one row per employee per
// pay period (see its migration comment), with only 4 statuses
// ('pending'|'approved'|'paid'|'cancelled'). The legacy UI models a
// two-level "period" concept with 5 statuses (draft/calculated/
// approved/paid/archived) tracking calculation + payslip generation
// separately from approval. There is no real backend concept of
// "calculated" or "payslips generated" (see docs/MODULE_INTEGRATION_MAP.md
// gap), so a real row is mapped onto the closest PayrollPeriod shape:
// pending -> calculated (ready to approve, matching approvePayroll's
// pending->approved precondition), approved/paid/cancelled map directly
// (cancelled shown as archived).
function mapStatus(status: PayrollRecord['status']): PayrollPeriodStatus {
  switch (status) {
    case 'pending':
      return 'calculated'
    case 'approved':
      return 'approved'
    case 'paid':
      return 'paid'
    case 'cancelled':
      return 'archived'
    default:
      return 'draft'
  }
}

function mapRecordToPeriod(r: PayrollRecord): PayrollPeriod {
  const status = mapStatus(r.status)
  return {
    id: r.id,
    reference: r.payroll_number,
    startDate: r.pay_period_start,
    endDate: r.pay_period_end,
    status,
    calculatedAt: r.created_at,
    approvedAt: status === 'approved' || status === 'paid' || status === 'archived' ? r.updated_at : null,
    approvedByName: null,
    payslipsGeneratedAt: status === 'approved' || status === 'paid' || status === 'archived' ? r.updated_at : null,
    paidAt: status === 'paid' || status === 'archived' ? r.updated_at : null,
    archivedAt: status === 'archived' ? r.updated_at : null,
    createdAt: r.created_at,
    createdBy: r.user_id,
  }
}

// ---------- Employees ----------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function usePayrollEmployees() {
  return useQuery({ queryKey: ['payroll', 'employees'], queryFn: payrollService.listPayrollEmployees })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useAddEmployeeToPayroll(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PayrollEmployeeInput) => payrollService.addEmployeeToPayroll(input, userId),
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

export function usePayrollPeriods() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['payroll', 'periods', ctx.business_id],
    queryFn: () =>
      listPayroll(ctx, {})
        .then(unwrap)
        .then((items: PayrollRecord[]) => items.map(mapRecordToPeriod)),
  })
}

export function usePayrollPeriod(id: string | undefined) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['payroll', 'period', id, ctx.business_id],
    queryFn: () => getPayroll(ctx, id as UUID).then(unwrap).then(mapRecordToPeriod),
    enabled: Boolean(id),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCreatePayrollPeriod(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) => payrollService.createPeriod(startDate, endDate, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function usePayslips(periodId?: string) {
  return useQuery({ queryKey: ['payroll', 'payslips', periodId ?? 'all'], queryFn: () => payrollService.listPayslips(periodId) })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCalculatePayroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.calculatePayroll(periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useApprovePeriod(_approverName: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => approvePayroll(ctx, periodId as UUID).then(unwrap),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useMarkPayslipsGenerated() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.markPayslipsGenerated(periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useRecordPayrollPayment() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => processPayrollPayment(ctx, periodId as UUID).then(unwrap),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useArchivePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.archivePeriod(periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePayrollDashboardKpis() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['payroll', 'kpis', ctx.business_id],
    queryFn: async () => {
      const items = (await listPayroll(ctx, {}).then(unwrap)) as PayrollRecord[]

      const activeEmployeeCount = new Set(items.filter((r) => r.status !== 'cancelled').map((r) => r.user_id)).size

      const sortedByDate = [...items].sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime())
      const currentPeriodStatus = sortedByDate.length > 0 ? mapStatus(sortedByDate[0].status) : null

      const pendingApprovalCount = items.filter((r) => r.status === 'pending').length

      const paidItems = items.filter((r) => r.status === 'paid')
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
