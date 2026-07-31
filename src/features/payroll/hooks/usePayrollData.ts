import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as payrollService from '../../../services/payrollService'
import type { PayComponentTypeInput, PayrollEmployeeInput } from '../../../types/payroll'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payroll'] })
}

// ---------- Employees ----------

export function usePayrollEmployees() {
  return useQuery({ queryKey: ['payroll', 'employees'], queryFn: payrollService.listPayrollEmployees })
}

export function useAddEmployeeToPayroll(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PayrollEmployeeInput) => payrollService.addEmployeeToPayroll(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdateEmployeeSalary(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, baseSalaryUgx }: { id: string; baseSalaryUgx: number }) => payrollService.updateEmployeeSalary(id, baseSalaryUgx, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useRemoveFromPayroll(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => payrollService.removeFromPayroll(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Component types (Allowances / Deductions) ----------

export function useComponentTypes(kind?: 'allowance' | 'deduction') {
  return useQuery({ queryKey: ['payroll', 'component-types', kind ?? 'all'], queryFn: () => payrollService.listComponentTypes(kind) })
}

export function useCreateComponentType(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, input }: { kind: 'allowance' | 'deduction'; input: PayComponentTypeInput }) =>
      payrollService.createComponentType(kind, input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useArchiveComponentType(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => payrollService.archiveComponentType(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Assignments ----------

export function useAssignments(employeeRecordId?: string) {
  return useQuery({ queryKey: ['payroll', 'assignments', employeeRecordId ?? 'all'], queryFn: () => payrollService.listAssignments(employeeRecordId) })
}

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

export function useRemoveAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => payrollService.removeAssignment(id),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Periods ----------

export function usePayrollPeriods() {
  return useQuery({ queryKey: ['payroll', 'periods'], queryFn: payrollService.listPeriods })
}

export function usePayrollPeriod(id: string | undefined) {
  return useQuery({
    queryKey: ['payroll', 'period', id],
    queryFn: () => payrollService.getPeriod(id as string),
    enabled: Boolean(id),
  })
}

export function useCreatePayrollPeriod(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ startDate, endDate }: { startDate: string; endDate: string }) => payrollService.createPeriod(startDate, endDate, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePayslips(periodId?: string) {
  return useQuery({ queryKey: ['payroll', 'payslips', periodId ?? 'all'], queryFn: () => payrollService.listPayslips(periodId) })
}

export function useCalculatePayroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.calculatePayroll(periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useApprovePeriod(approverName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.approvePeriod(periodId, approverName),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useMarkPayslipsGenerated() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.markPayslipsGenerated(periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useRecordPayrollPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.recordPayrollPayment(periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useArchivePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => payrollService.archivePeriod(periodId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePayrollDashboardKpis() {
  return useQuery({ queryKey: ['payroll', 'kpis'], queryFn: payrollService.getPayrollDashboardKpis })
}
