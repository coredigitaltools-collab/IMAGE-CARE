import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as expenseService from '../../../services/expenseService'
import type { ExpenseCategoryInput, ExpenseInput, ExpenseSettings, RecurringExpenseInput } from '../../../types/expenses'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['expenses'] })
}

// ---------- Settings ----------

export function useExpenseSettings() {
  return useQuery({ queryKey: ['expenses', 'settings'], queryFn: expenseService.getExpenseSettings })
}

export function useSaveExpenseSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ExpenseSettings) => expenseService.saveExpenseSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Categories ----------

export function useExpenseCategories() {
  return useQuery({ queryKey: ['expenses', 'categories'], queryFn: expenseService.listCategories })
}

export function useCreateExpenseCategory(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ExpenseCategoryInput) => expenseService.createCategory(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useArchiveExpenseCategory(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expenseService.archiveCategory(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Expenses ----------

export function useExpenses() {
  return useQuery({ queryKey: ['expenses', 'list'], queryFn: expenseService.listExpenses })
}

export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: ['expenses', 'one', id],
    queryFn: () => expenseService.getExpense(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateExpense(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ExpenseInput) => expenseService.createExpense(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useSubmitExpense(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expenseService.submitExpense(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useApproveExpense(userId: string, approverName: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expenseService.approveExpense(id, approverName, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useRejectExpense(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => expenseService.rejectExpense(id, reason, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useMarkExpensePaid(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expenseService.markExpensePaid(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCancelExpense(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => expenseService.cancelExpense(id, reason, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Recurring templates ----------

export function useRecurringTemplates() {
  return useQuery({ queryKey: ['expenses', 'recurring'], queryFn: expenseService.listRecurringTemplates })
}

export function useCreateRecurringTemplate(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecurringExpenseInput) => expenseService.createRecurringTemplate(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useArchiveRecurringTemplate(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => expenseService.archiveRecurringTemplate(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useGenerateDueRecurringExpenses(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => expenseService.generateDueRecurringExpenses(userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------- Dashboard & Reports ----------

export function useExpenseDashboardKpis() {
  return useQuery({ queryKey: ['expenses', 'kpis'], queryFn: expenseService.getExpenseDashboardKpis })
}

export function useSpendByCategory() {
  return useQuery({ queryKey: ['expenses', 'spend-by-category'], queryFn: expenseService.getSpendByCategory })
}
