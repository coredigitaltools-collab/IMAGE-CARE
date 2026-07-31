import type { AuditFields } from '../lib/audit'

// ---------- Payroll (IMC-SRS-011) ----------
// "Employees come from Staff Master" is implemented literally: a
// PayrollEmployeeRecord references an existing StaffMember (staffId) —
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
// hard coded payroll data") — e.g. "Transport Allowance," "NSSF,"
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
