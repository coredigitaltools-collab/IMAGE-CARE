import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { listStaff } from './staffService'
import type {
  EmployeePayComponent,
  PayComponentType,
  PayComponentTypeInput,
  PayrollEmployeeInput,
  PayrollEmployeeRecord,
  PayrollPeriod,
  PayslipLine,
} from '../types/payroll'

const EMPLOYEES_KEY = 'payroll:employees'
const COMPONENT_TYPES_KEY = 'payroll:component-types'
const ASSIGNMENTS_KEY = 'payroll:assignments'
const PERIODS_KEY = 'payroll:periods'
const PAYSLIPS_KEY = 'payroll:payslips'

export class OverlappingPeriodError extends Error {
  constructor() {
    super('This payroll period overlaps with an existing one.')
    this.name = 'OverlappingPeriodError'
  }
}
export class PayrollLockedError extends Error {
  constructor() {
    super('This payroll period is approved and locked, it can no longer be recalculated.')
    this.name = 'PayrollLockedError'
  }
}
export class InvalidPeriodTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPeriodTransitionError'
  }
}
export class NoEmployeesInPayrollError extends Error {
  constructor() {
    super('Add at least one employee to payroll before calculating.')
    this.name = 'NoEmployeesInPayrollError'
  }
}

function generateReference(existing: { reference: string }[], prefix: string): string {
  const numbers = existing.map((e) => Number(e.reference.replace(/\D/g, ''))).filter((n) => !Number.isNaN(n))
  const next = (numbers.length > 0 ? Math.max(...numbers) : 30000) + 1
  return `${prefix}-${next}`
}

// ---------- Employee payroll records ----------

export async function listPayrollEmployees(): Promise<PayrollEmployeeRecord[]> {
  return getCollection<PayrollEmployeeRecord>(EMPLOYEES_KEY, () => [])
}

export async function addEmployeeToPayroll(input: PayrollEmployeeInput, userId: string): Promise<PayrollEmployeeRecord> {
  const staff = await listStaff()
  if (!staff.some((s) => s.id === input.staffId)) throw new Error('Select a valid staff member.')
  const existing = await listPayrollEmployees()
  if (existing.some((e) => e.staffId === input.staffId && e.is_active)) {
    throw new Error('This staff member is already on payroll.')
  }
  const record: PayrollEmployeeRecord = { ...stampNew(userId), ...input }
  await setCollection(EMPLOYEES_KEY, [...existing, record])
  await enqueueSync({ entityType: 'payroll_employee', entityId: record.id, operation: 'create' })
  return record
}

export async function updateEmployeeSalary(id: string, baseSalaryUgx: number, userId: string): Promise<PayrollEmployeeRecord> {
  const employees = await listPayrollEmployees()
  let updated: PayrollEmployeeRecord | null = null
  const next = employees.map((e) => {
    if (e.id !== id) return e
    updated = stampUpdated({ ...e, baseSalaryUgx }, userId)
    return updated
  })
  if (!updated) throw new Error('Payroll employee record not found.')
  await setCollection(EMPLOYEES_KEY, next)
  await enqueueSync({ entityType: 'payroll_employee', entityId: id, operation: 'update' })
  return updated
}

export async function removeFromPayroll(id: string, userId: string): Promise<void> {
  const employees = await listPayrollEmployees()
  const next = employees.map((e) => (e.id === id ? stampUpdated({ ...e, is_active: false }, userId) : e))
  await setCollection(EMPLOYEES_KEY, next)
  await enqueueSync({ entityType: 'payroll_employee', entityId: id, operation: 'disable' })
}

// ---------- Pay component types (Allowances / Deductions catalogue) ----------

type StoredComponentType = PayComponentType & { kind: 'allowance' | 'deduction' }

export async function listComponentTypes(kind?: 'allowance' | 'deduction'): Promise<StoredComponentType[]> {
  const types = await getCollection<StoredComponentType>(COMPONENT_TYPES_KEY, () => [])
  return kind ? types.filter((t) => t.kind === kind) : types
}

export async function createComponentType(kind: 'allowance' | 'deduction', input: PayComponentTypeInput, userId: string): Promise<StoredComponentType> {
  const types = await getCollection<StoredComponentType>(COMPONENT_TYPES_KEY, () => [])
  const type: StoredComponentType = { ...stampNew(userId), ...input, kind }
  await setCollection(COMPONENT_TYPES_KEY, [...types, type])
  await enqueueSync({ entityType: 'pay_component_type', entityId: type.id, operation: 'create' })
  return type
}

export async function archiveComponentType(id: string, userId: string): Promise<void> {
  const types = await getCollection<StoredComponentType>(COMPONENT_TYPES_KEY, () => [])
  const next = types.map((t) => (t.id === id ? stampUpdated({ ...t, is_active: false }, userId) : t))
  await setCollection(COMPONENT_TYPES_KEY, next)
  await enqueueSync({ entityType: 'pay_component_type', entityId: id, operation: 'disable' })
}

// ---------- Assigning components to employees ----------

export async function listAssignments(employeeRecordId?: string): Promise<EmployeePayComponent[]> {
  const assignments = await getCollection<EmployeePayComponent>(ASSIGNMENTS_KEY, () => [])
  return employeeRecordId ? assignments.filter((a) => a.employeeRecordId === employeeRecordId) : assignments
}

export async function assignComponent(
  employeeRecordId: string,
  componentTypeId: string,
  kind: 'allowance' | 'deduction',
  amountOverride: number | null,
): Promise<EmployeePayComponent> {
  const assignments = await getCollection<EmployeePayComponent>(ASSIGNMENTS_KEY, () => [])
  const assignment: EmployeePayComponent = { id: crypto.randomUUID(), employeeRecordId, componentTypeId, kind, amountOverride }
  await setCollection(ASSIGNMENTS_KEY, [...assignments, assignment])
  await enqueueSync({ entityType: 'employee_pay_component', entityId: assignment.id, operation: 'create' })
  return assignment
}

export async function removeAssignment(id: string): Promise<void> {
  const assignments = await getCollection<EmployeePayComponent>(ASSIGNMENTS_KEY, () => [])
  await setCollection(
    ASSIGNMENTS_KEY,
    assignments.filter((a) => a.id !== id),
  )
  await enqueueSync({ entityType: 'employee_pay_component', entityId: id, operation: 'disable' })
}

// ---------- Payroll periods ----------

export async function listPeriods(): Promise<PayrollPeriod[]> {
  const periods = await getCollection<PayrollPeriod>(PERIODS_KEY, () => [])
  return [...periods].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
}

export async function getPeriod(id: string): Promise<PayrollPeriod | null> {
  const periods = await listPeriods()
  return periods.find((p) => p.id === id) ?? null
}

/** "Payroll periods cannot overlap", checked against every
 *  non-archived period (an archived one is historical and can no
 *  longer conflict with anything going forward). */
export async function createPeriod(startDate: string, endDate: string, userId: string): Promise<PayrollPeriod> {
  if (new Date(endDate).getTime() < new Date(startDate).getTime()) throw new Error('End date must be on or after the start date.')
  const existing = await listPeriods()
  const newStart = new Date(startDate).getTime()
  const newEnd = new Date(endDate).getTime()
  const overlaps = existing.some((p) => {
    if (p.status === 'archived') return false
    const pStart = new Date(p.startDate).getTime()
    const pEnd = new Date(p.endDate).getTime()
    return newStart <= pEnd && newEnd >= pStart
  })
  if (overlaps) throw new OverlappingPeriodError()

  const period: PayrollPeriod = {
    id: crypto.randomUUID(),
    reference: generateReference(existing, 'PAY'),
    startDate,
    endDate,
    status: 'draft',
    calculatedAt: null,
    approvedAt: null,
    approvedByName: null,
    payslipsGeneratedAt: null,
    paidAt: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  await setCollection(PERIODS_KEY, [...existing, period])
  await enqueueSync({ entityType: 'payroll_period', entityId: period.id, operation: 'create' })
  return period
}

async function updatePeriod(id: string, patch: Partial<PayrollPeriod>): Promise<PayrollPeriod> {
  const periods = await listPeriods()
  let updated: PayrollPeriod | null = null
  const next = periods.map((p) => {
    if (p.id !== id) return p
    updated = { ...p, ...patch }
    return updated
  })
  if (!updated) throw new Error('Payroll period not found.')
  await setCollection(PERIODS_KEY, next)
  await enqueueSync({ entityType: 'payroll_period', entityId: id, operation: 'update' })
  return updated
}

export async function listPayslips(periodId?: string): Promise<PayslipLine[]> {
  const payslips = await getCollection<PayslipLine>(PAYSLIPS_KEY, () => [])
  return periodId ? payslips.filter((p) => p.periodId === periodId) : payslips
}

/** "Processed payroll is locked after approval", calculation is only
 *  allowed while a period is still 'draft' or 'calculated' (so it can
 *  be re-run to fix a mistake before approving), never once 'approved'.
 *  Re-running fully replaces that period's payslip lines rather than
 *  appending, so there's never a stale duplicate set. */
export async function calculatePayroll(periodId: string): Promise<PayslipLine[]> {
  const period = await getPeriod(periodId)
  if (!period) throw new Error('Payroll period not found.')
  if (period.status === 'approved' || period.status === 'paid' || period.status === 'archived') throw new PayrollLockedError()

  const [employees, staff, componentTypes, assignments] = await Promise.all([
    listPayrollEmployees(),
    listStaff(),
    listComponentTypes(),
    listAssignments(),
  ])
  const activeEmployees = employees.filter((e) => e.is_active)
  if (activeEmployees.length === 0) throw new NoEmployeesInPayrollError()

  const newPayslips: PayslipLine[] = activeEmployees.map((emp) => {
    const staffMember = staff.find((s) => s.id === emp.staffId)
    const empAssignments = assignments.filter((a) => a.employeeRecordId === emp.id)

    const computeAmount = (a: EmployeePayComponent): { name: string; amount: number } | null => {
      const type = componentTypes.find((t) => t.id === a.componentTypeId)
      if (!type) return null
      const raw = a.amountOverride ?? type.amount
      const amount = type.isPercentageOfBase ? Math.round((emp.baseSalaryUgx * raw) / 100) : raw
      return { name: type.name, amount }
    }

    const allowances = empAssignments
      .filter((a) => a.kind === 'allowance')
      .map(computeAmount)
      .filter((x): x is { name: string; amount: number } => x !== null)
    const deductions = empAssignments
      .filter((a) => a.kind === 'deduction')
      .map(computeAmount)
      .filter((x): x is { name: string; amount: number } => x !== null)

    const grossPay = emp.baseSalaryUgx + allowances.reduce((sum, a) => sum + a.amount, 0)
    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0)

    return {
      id: crypto.randomUUID(),
      periodId,
      employeeRecordId: emp.id,
      staffId: emp.staffId,
      staffName: staffMember?.fullName ?? 'Unknown staff member',
      baseSalary: emp.baseSalaryUgx,
      allowances,
      deductions,
      grossPay,
      totalDeductions,
      netPay: grossPay - totalDeductions,
    }
  })

  const allPayslips = await getCollection<PayslipLine>(PAYSLIPS_KEY, () => [])
  const others = allPayslips.filter((p) => p.periodId !== periodId)
  await setCollection(PAYSLIPS_KEY, [...others, ...newPayslips])
  await enqueueSync({ entityType: 'payroll_period', entityId: periodId, operation: 'update' })

  await updatePeriod(periodId, { status: 'calculated', calculatedAt: new Date().toISOString() })
  return newPayslips
}

export async function approvePeriod(periodId: string, approverName: string): Promise<PayrollPeriod> {
  const period = await getPeriod(periodId)
  if (!period) throw new Error('Payroll period not found.')
  if (period.status !== 'calculated') throw new InvalidPeriodTransitionError('Only a calculated period can be approved.')
  return updatePeriod(periodId, { status: 'approved', approvedAt: new Date().toISOString(), approvedByName: approverName })
}

export async function markPayslipsGenerated(periodId: string): Promise<PayrollPeriod> {
  const period = await getPeriod(periodId)
  if (!period) throw new Error('Payroll period not found.')
  if (period.status !== 'approved') throw new InvalidPeriodTransitionError('Approve the period before generating payslips.')
  return updatePeriod(periodId, { payslipsGeneratedAt: new Date().toISOString() })
}

export async function recordPayrollPayment(periodId: string): Promise<PayrollPeriod> {
  const period = await getPeriod(periodId)
  if (!period) throw new Error('Payroll period not found.')
  if (period.status !== 'approved') throw new InvalidPeriodTransitionError('Approve the period (and generate payslips) before recording payment.')
  return updatePeriod(periodId, { status: 'paid', paidAt: new Date().toISOString() })
}

export async function archivePeriod(periodId: string): Promise<PayrollPeriod> {
  const period = await getPeriod(periodId)
  if (!period) throw new Error('Payroll period not found.')
  if (period.status !== 'paid') throw new InvalidPeriodTransitionError('Only a paid period can be archived.')
  return updatePeriod(periodId, { status: 'archived', archivedAt: new Date().toISOString() })
}

// ---------- Dashboard & Reports ----------

export interface PayrollDashboardKpis {
  activeEmployeeCount: number
  currentPeriodStatus: string | null
  pendingApprovalCount: number
  lastPaidAmountUgx: number
  lastPaidAt: string | null
  ytdPayrollCostUgx: number
}

export async function getPayrollDashboardKpis(): Promise<PayrollDashboardKpis> {
  const [employees, periods, payslips] = await Promise.all([listPayrollEmployees(), listPeriods(), listPayslips()])
  const activeEmployees = employees.filter((e) => e.is_active)

  const currentPeriod = periods.find((p) => p.status !== 'archived')
  const pendingApproval = periods.filter((p) => p.status === 'calculated').length

  const paidPeriods = periods
    .filter((p) => p.status === 'paid' || p.status === 'archived')
    .sort((a, b) => new Date(b.paidAt ?? 0).getTime() - new Date(a.paidAt ?? 0).getTime())
  const lastPaid = paidPeriods[0]
  const lastPaidPayslips = lastPaid ? payslips.filter((p) => p.periodId === lastPaid.id) : []

  const now = new Date()
  const ytdPayslips = payslips.filter((p) => {
    const period = periods.find((per) => per.id === p.periodId)
    return period && (period.status === 'paid' || period.status === 'archived') && new Date(period.startDate).getFullYear() === now.getFullYear()
  })

  return {
    activeEmployeeCount: activeEmployees.length,
    currentPeriodStatus: currentPeriod?.status ?? null,
    pendingApprovalCount: pendingApproval,
    lastPaidAmountUgx: lastPaidPayslips.reduce((sum, p) => sum + p.netPay, 0),
    lastPaidAt: lastPaid?.paidAt ?? null,
    ytdPayrollCostUgx: ytdPayslips.reduce((sum, p) => sum + p.netPay, 0),
  }
}
