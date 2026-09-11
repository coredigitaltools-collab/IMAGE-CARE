import type { AuditFields } from '../lib/audit'

// ---------- Payroll (IMC-SRS-011) ----------
// "Employees come from Staff Master" is implemented literally: a
// PayrollEmployeeRecord references an existing StaffMember (staffId),
// it adds compensation data (base salary, assigned allowances/
// deductions), it never duplicates name/role/branch, which stay owned
// by Staff Master (Settings → People & Access). Same pattern as Bills
// referencing Supplier Invoices and Invoices referencing Sales.

export interface PayrollEmployeeRecord extends AuditFields {
  staffId: string
  baseSalaryUgx: number
}
export type PayrollEmployeeInput = Pick<PayrollEmployeeRecord, 'staffId' | 'baseSalaryUgx'>

// Allowance/Deduction TYPES are the business-defined catalogue ("No
// hard coded payroll data"), e.g. "Transport Allowance," "NSSF,"
// "PAYE." Nothing here assumes a specific country's tax code or a
// preset list; the business defines every one of these themselves.
export interface PayComponentType extends AuditFields {
  name: string
  isPercentageOfBase: boolean
  amount: number // UGX if fixed, percent (0-100) if isPercentageOfBase
}
export type PayComponentTypeInput = Pick<PayComponentType, 'name' | 'isPercentageOfBase' | 'amount'>

export interface EmployeePayComponent {
  id: string
  employeeRecordId: string
  componentTypeId: string
  kind: 'allowance' | 'deduction'
  amountOverride: number | null // null = use the type's default amount/percent
}

// ---------- Payroll business-rule errors ----------
// These live here (not in a service) because the payroll period
// lifecycle is now served by the real backend service
// (services/payroll/payrollPeriodService.ts) while employee /
// pay-component management is still local (services/payrollService.ts),
// and the pages catch these same error types regardless of which
// service raised them.

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
  constructor(message = 'Add at least one employee to payroll before calculating.') {
    super(message)
    this.name = 'NoEmployeesInPayrollError'
  }
}

export type PayrollPeriodStatus = 'draft' | 'calculated' | 'approved' | 'paid' | 'archived'
export const PAYROLL_STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
  draft: 'Draft',
  calculated: 'Calculated',
  approved: 'Approved',
  paid: 'Paid',
  archived: 'Archived',
}

export interface PayrollPeriod {
  id: string
  reference: string
  startDate: string
  endDate: string
  status: PayrollPeriodStatus
  calculatedAt: string | null
  approvedAt: string | null
  approvedByName: string | null
  payslipsGeneratedAt: string | null
  paidAt: string | null
  archivedAt: string | null
  createdAt: string
  createdBy: string
}

export interface PayLineComponent {
  name: string
  amount: number
}

export interface PayslipLine {
  id: string
  periodId: string
  employeeRecordId: string
  staffId: string
  staffName: string
  baseSalary: number
  allowances: PayLineComponent[]
  deductions: PayLineComponent[]
  grossPay: number
  totalDeductions: number
  netPay: number
}
