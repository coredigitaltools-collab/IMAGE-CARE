import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import type {
  Expense,
  ExpenseCategory,
  ExpenseCategoryInput,
  ExpenseInput,
  RecurringExpenseInput,
  RecurringExpenseTemplate,
} from '../types/expenses'

const CATEGORIES_KEY = 'expenses:categories'
const EXPENSES_KEY = 'expenses:expenses'
const RECURRING_KEY = 'expenses:recurring'

export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024 // 3MB — generous for a receipt photo, bounded so it doesn't bloat the offline cache

export class InvalidExpenseTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidExpenseTransitionError'
  }
}
export class ApprovedExpenseImmutableError extends Error {
  constructor() {
    super('Approved and paid expenses cannot be cancelled or deleted.')
    this.name = 'ApprovedExpenseImmutableError'
  }
}
export class AttachmentTooLargeError extends Error {
  constructor() {
    super('Attachments are limited to 3MB.')
    this.name = 'AttachmentTooLargeError'
  }
}

function generateReference(existing: { reference: string }[], prefix: string): string {
  const numbers = existing.map((e) => Number(e.reference.replace(/\D/g, ''))).filter((n) => !Number.isNaN(n))
  const next = (numbers.length > 0 ? Math.max(...numbers) : 40000) + 1
  return `${prefix}-${next}`
}

// ---------- Categories ("Configurable categories" — nothing preset) ----------

export async function listCategories(): Promise<ExpenseCategory[]> {
  return getCollection<ExpenseCategory>(CATEGORIES_KEY, () => [])
}

export async function createCategory(input: ExpenseCategoryInput, userId: string): Promise<ExpenseCategory> {
  const categories = await listCategories()
  const category: ExpenseCategory = { ...stampNew(userId), ...input }
  await setCollection(CATEGORIES_KEY, [...categories, category])
  await enqueueSync({ entityType: 'expense_category', entityId: category.id, operation: 'create' })
  return category
}

export async function archiveCategory(id: string, userId: string): Promise<void> {
  const categories = await listCategories()
  const next = categories.map((c) => (c.id === id ? stampUpdated({ ...c, is_active: false }, userId) : c))
  await setCollection(CATEGORIES_KEY, next)
  await enqueueSync({ entityType: 'expense_category', entityId: id, operation: 'disable' })
}

// ---------- Expenses ----------

export async function listExpenses(): Promise<Expense[]> {
  const expenses = await getCollection<Expense>(EXPENSES_KEY, () => [])
  return [...expenses].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function getExpense(id: string): Promise<Expense | null> {
  const expenses = await listExpenses()
  return expenses.find((e) => e.id === id) ?? null
}

function validateAttachment(input: ExpenseInput) {
  if (input.attachment && input.attachment.sizeBytes > MAX_ATTACHMENT_BYTES) throw new AttachmentTooLargeError()
}

export async function createExpense(input: ExpenseInput, userId: string, recurringTemplateId: string | null = null): Promise<Expense> {
  validateAttachment(input)
  const existing = await listExpenses()
  const expense: Expense = {
    ...stampNew(userId),
    reference: generateReference(existing, 'EXP'),
    ...input,
    status: 'draft',
    submittedAt: null,
    approvedAt: null,
    approvedByName: null,
    rejectedAt: null,
    rejectionReason: null,
    paidAt: null,
    cancelReason: null,
    recurringTemplateId,
  }
  await setCollection(EXPENSES_KEY, [...existing, expense])
  await enqueueSync({ entityType: 'expense', entityId: expense.id, operation: 'create' })
  return expense
}

async function updateExpense(id: string, patch: Partial<Expense>, userId: string): Promise<Expense> {
  const expenses = await listExpenses()
  let updated: Expense | null = null
  const next = expenses.map((e) => {
    if (e.id !== id) return e
    updated = stampUpdated({ ...e, ...patch }, userId)
    return updated
  })
  if (!updated) throw new Error('Expense not found.')
  await setCollection(EXPENSES_KEY, next)
  await enqueueSync({ entityType: 'expense', entityId: id, operation: 'update' })
  return updated
}

export async function submitExpense(id: string, userId: string): Promise<Expense> {
  const expense = await getExpense(id)
  if (!expense) throw new Error('Expense not found.')
  if (expense.status !== 'draft') throw new InvalidExpenseTransitionError('Only a draft expense can be submitted for approval.')
  return updateExpense(id, { status: 'pending_approval', submittedAt: new Date().toISOString() }, userId)
}

export async function approveExpense(id: string, approverName: string, userId: string): Promise<Expense> {
  const expense = await getExpense(id)
  if (!expense) throw new Error('Expense not found.')
  if (expense.status !== 'pending_approval') throw new InvalidExpenseTransitionError('Only an expense pending approval can be approved.')
  return updateExpense(id, { status: 'approved', approvedAt: new Date().toISOString(), approvedByName: approverName }, userId)
}

export async function rejectExpense(id: string, reason: string, userId: string): Promise<Expense> {
  if (!reason.trim()) throw new Error('A reason is required to reject an expense.')
  const expense = await getExpense(id)
  if (!expense) throw new Error('Expense not found.')
  if (expense.status !== 'pending_approval') throw new InvalidExpenseTransitionError('Only an expense pending approval can be rejected.')
  return updateExpense(id, { status: 'rejected', rejectedAt: new Date().toISOString(), rejectionReason: reason.trim() }, userId)
}

export async function markExpensePaid(id: string, userId: string): Promise<Expense> {
  const expense = await getExpense(id)
  if (!expense) throw new Error('Expense not found.')
  if (expense.status !== 'approved') throw new InvalidExpenseTransitionError('Only an approved expense can be marked paid.')
  return updateExpense(id, { status: 'paid', paidAt: new Date().toISOString() }, userId)
}

/** "Approved expenses cannot be deleted" — and this app never hard-deletes
 *  anything anyway, so cancellation is the only removal path, and it's
 *  blocked outright once an expense is approved or paid. */
export async function cancelExpense(id: string, reason: string, userId: string): Promise<Expense> {
  if (!reason.trim()) throw new Error('A reason is required to cancel an expense.')
  const expense = await getExpense(id)
  if (!expense) throw new Error('Expense not found.')
  if (expense.status === 'approved' || expense.status === 'paid') throw new ApprovedExpenseImmutableError()
  return updateExpense(id, { status: 'cancelled', cancelReason: reason.trim() }, userId)
}

// ---------- Recurring expenses ----------
// Same honest pattern used for Loyalty's point expiration: no real
// background cron exists in this offline-first PWA, so generating due
// recurring expenses is an explicit, auditable action rather than a
// silent process nobody can see happen.

export async function listRecurringTemplates(): Promise<RecurringExpenseTemplate[]> {
  return getCollection<RecurringExpenseTemplate>(RECURRING_KEY, () => [])
}

export async function createRecurringTemplate(input: RecurringExpenseInput, userId: string): Promise<RecurringExpenseTemplate> {
  const templates = await listRecurringTemplates()
  const template: RecurringExpenseTemplate = { ...stampNew(userId), ...input }
  await setCollection(RECURRING_KEY, [...templates, template])
  await enqueueSync({ entityType: 'recurring_expense', entityId: template.id, operation: 'create' })
  return template
}

export async function archiveRecurringTemplate(id: string, userId: string): Promise<void> {
  const templates = await listRecurringTemplates()
  const next = templates.map((t) => (t.id === id ? stampUpdated({ ...t, is_active: false }, userId) : t))
  await setCollection(RECURRING_KEY, next)
  await enqueueSync({ entityType: 'recurring_expense', entityId: id, operation: 'disable' })
}

function advanceDueDate(dateStr: string, frequency: RecurringExpenseTemplate['frequency']): string {
  const d = new Date(dateStr)
  if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export async function generateDueRecurringExpenses(userId: string): Promise<{ generated: number }> {
  const templates = (await listRecurringTemplates()).filter((t) => t.is_active)
  const today = new Date().toISOString().slice(0, 10)
  let generated = 0

  for (const template of templates) {
    let nextDue = template.nextDueDate
    // A template can be overdue by more than one cycle (e.g. app unused
    // for two months) — generate every occurrence that's actually due,
    // not just one, so history stays accurate.
    while (nextDue <= today) {
      await createExpense(
        {
          categoryId: template.categoryId,
          categoryName: template.categoryName,
          description: template.description,
          amount: template.amount,
          branchId: null,
          expenseDate: nextDue,
          attachment: null,
        },
        userId,
        template.id,
      )
      generated += 1
      nextDue = advanceDueDate(nextDue, template.frequency)
    }
    if (nextDue !== template.nextDueDate) {
      const templatesNow = await listRecurringTemplates()
      const next = templatesNow.map((t) => (t.id === template.id ? stampUpdated({ ...t, nextDueDate: nextDue }, userId) : t))
      await setCollection(RECURRING_KEY, next)
      await enqueueSync({ entityType: 'recurring_expense', entityId: template.id, operation: 'update' })
    }
  }
  return { generated }
}

// ---------- Dashboard & Reports ----------

export interface ExpenseDashboardKpis {
  totalThisMonthUgx: number
  pendingApprovalCount: number
  approvedUnpaidUgx: number
  paidThisMonthUgx: number
}

export async function getExpenseDashboardKpis(): Promise<ExpenseDashboardKpis> {
  const expenses = await listExpenses()
  const now = new Date()
  const thisMonth = expenses.filter((e) => {
    const d = new Date(e.expenseDate)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && e.status !== 'cancelled' && e.status !== 'rejected'
  })

  return {
    totalThisMonthUgx: thisMonth.reduce((sum, e) => sum + e.amount, 0),
    pendingApprovalCount: expenses.filter((e) => e.status === 'pending_approval').length,
    approvedUnpaidUgx: expenses.filter((e) => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0),
    paidThisMonthUgx: thisMonth.filter((e) => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0),
  }
}

export interface CategorySpendRow {
  categoryId: string
  categoryName: string
  totalUgx: number
  count: number
}

export async function getSpendByCategory(): Promise<CategorySpendRow[]> {
  const expenses = (await listExpenses()).filter((e) => e.status !== 'cancelled' && e.status !== 'rejected')
  const byCategory = new Map<string, CategorySpendRow>()
  for (const e of expenses) {
    const existing = byCategory.get(e.categoryId) ?? { categoryId: e.categoryId, categoryName: e.categoryName, totalUgx: 0, count: 0 }
    existing.totalUgx += e.amount
    existing.count += 1
    byCategory.set(e.categoryId, existing)
  }
  return [...byCategory.values()].sort((a, b) => b.totalUgx - a.totalUgx)
}
