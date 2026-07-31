import type { AuditFields } from '../lib/audit'

// ---------- Expenses (IMC-SRS-012) ----------

export interface ExpenseCategory extends AuditFields {
  name: string
}
export type ExpenseCategoryInput = Pick<ExpenseCategory, 'name'>

export type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'cancelled'
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export interface ExpenseAttachment {
  fileName: string
  mimeType: string
  dataUrl: string // base64, stored in IndexedDB via the same offline-first cache as everything else
  sizeBytes: number
}

export interface Expense extends AuditFields {
  reference: string
  categoryId: string
  categoryName: string // snapshot — stays accurate even if the category is renamed later
  description: string
  amount: number
  branchId: string | null
  expenseDate: string
  status: ExpenseStatus
  attachment: ExpenseAttachment | null
  submittedAt: string | null
  approvedAt: string | null
  approvedByName: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  paidAt: string | null
  cancelReason: string | null
  recurringTemplateId: string | null
}
export type ExpenseInput = Pick<Expense, 'categoryId' | 'categoryName' | 'description' | 'amount' | 'branchId' | 'expenseDate'> & {
  attachment: ExpenseAttachment | null
}

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export interface RecurringExpenseTemplate extends AuditFields {
  categoryId: string
  categoryName: string
  description: string
  amount: number
  frequency: RecurringFrequency
  nextDueDate: string
}
export type RecurringExpenseInput = Pick<RecurringExpenseTemplate, 'categoryId' | 'categoryName' | 'description' | 'amount' | 'frequency' | 'nextDueDate'>

export interface ExpenseSettings {
  // Expenses at or below this amount skip manual approval entirely when
  // submitted — 0 means every expense requires approval, no exceptions.
  // A real, configurable business rule, not a cosmetic setting.
  autoApproveThresholdUgx: number
}
