// ============================================================
// Local payroll master data ONLY.
//
// The payroll *period* lifecycle (create / calculate / approve /
// generate payslips / record payment / archive, plus the period list,
// detail, payslips and dashboard KPIs) is real and lives on
// imagecare.payroll - see services/payroll/payrollPeriodService.ts.
// It used to be duplicated here against a local store, which meant a
// saved period was invisible to every other part of the module; that
// duplicate implementation has been removed rather than left behind as
// a second source of truth.
//
// What remains here is the payroll employee register, the allowance /
// deduction catalogue and its per-employee assignments. Those have no
// table in the real schema (see docs/MODULE_INTEGRATION_MAP.md gap),
// so they are still local.
// ============================================================

import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { listStaff as listRealStaff } from './settings/settingsService'
import type { UserContext } from '../types/app'
import type {
  EmployeePayComponent,
  PayComponentType,
  PayComponentTypeInput,
  PayrollEmployeeInput,
  PayrollEmployeeRecord,
} from '../types/payroll'

const EMPLOYEES_KEY = 'payroll:employees'
const COMPONENT_TYPES_KEY = 'payroll:component-types'
const ASSIGNMENTS_KEY = 'payroll:assignments'

// ---------- Employee payroll records ----------

export async function listPayrollEmployees(): Promise<PayrollEmployeeRecord[]> {
  return getCollection<PayrollEmployeeRecord>(EMPLOYEES_KEY, () => [])
}

// Bug fix (2026-09-05): this used to validate staffId against
// services/staffService.ts's local-storage staff collection (seeded with
// unrelated fake records), while the "Staff member" dropdown that feeds
// staffId is built from the REAL staff list (imagecare.users, via
// settingsService.listStaff - see PayrollEmployeesPage's useStaff()). The
// two lists never share ids, so choosing any real staff member (e.g. a
// PIN-only staff member added under Settings -> People & Access) always
// failed with "Select a valid staff member." even though a valid one was
// selected. Validate against the same real staff list the dropdown uses.
export async function addEmployeeToPayroll(ctx: UserContext, input: PayrollEmployeeInput, userId: string): Promise<PayrollEmployeeRecord> {
  const staffResult = await listRealStaff(ctx)
  if (staffResult.error) throw new Error(staffResult.error.message || 'Could not load staff.')
  const staff = staffResult.data ?? []
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
