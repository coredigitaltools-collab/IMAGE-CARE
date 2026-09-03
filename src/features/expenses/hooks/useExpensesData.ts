// Stage 5: Expenses feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import { createExpense, listExpenses, updateExpense, deleteExpense } from '../../../services/financial/financialServices';
import type { UpdateExpenseInput } from '../../../services/financial/financialServices';
import { listExpenseCategories, createExpenseCategory } from '../../../services/settings/settingsService';
import {
  getExpenseSettings as getExpenseSettingsLocal,
  saveExpenseSettings as saveExpenseSettingsLocal,
  listRecurringTemplates as listRecurringTemplatesLocal,
  createRecurringTemplate as createRecurringTemplateLocal,
  archiveRecurringTemplate as archiveRecurringTemplateLocal,
  generateDueRecurringExpenses as generateDueRecurringExpensesLocal,
} from '../../../services/expenseService';
import type { ExpenseSettings, RecurringExpenseInput } from '../../../types/expenses';
import type { UUID } from '../../../types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

export function useExpenseSettings(_userId?: string) {
  return useQuery({ queryKey: ['expenses', 'settings'], queryFn: () => getExpenseSettingsLocal() });
}

export function useExpenseCategories() {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['expenses', 'categories', ctx.business_id], queryFn: () => listExpenseCategories(ctx).then(unwrap) });
}

export function useCreateExpenseCategory(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { name: string }) => createExpenseCategory(ctx, input.name).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'categories'] }) });
}

export function useExpenses(branchId?: UUID) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({ queryKey: ['expenses', 'list', ctx.business_id, branchId ?? branch], queryFn: () => listExpenses(ctx, { branch_id: (branchId ?? branch) as string | undefined }).then(unwrap) });
}

export function useCreateExpense(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => createExpense(ctx, {
      branch_id: (input.branchId ?? input.branch_id ?? branch ?? ctx.branch_id) as UUID,
      category: input.categoryName ?? input.category ?? input.categoryId ?? 'General',
      description: input.description,
      amount: input.amount,
      tax_amount: input.taxAmount ?? input.tax_amount ?? 0,
      payment_method: (input.paymentMethod ?? input.payment_method ?? 'cash') as 'cash' | 'mobile_money' | 'bank_transfer' | 'card',
      expense_date: input.expenseDate ?? input.expense_date ?? new Date().toISOString(),
    }).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); },
  });
}

export function useExpenseDashboardKpis(branchId?: UUID) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['expenses', 'kpis', ctx.business_id, branchId ?? branch],
    queryFn: async () => {
      const expenses = await listExpenses(ctx, { branch_id: (branchId ?? branch) as string | undefined }).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = Array.isArray(expenses) ? expenses as any[] : [];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monthExpenses = items.filter((e: any) => (e.expense_date ?? e.created_at ?? '') >= monthStart);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const thisMonth = monthExpenses.reduce((s: number, e: any) => s + (e.total_amount ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalOverall = items.reduce((s: number, e: any) => s + (e.total_amount ?? 0), 0);
      // Draft/pending-approval/paid concepts removed 2026-08-31 - every recorded
      // expense is final, so the only meaningful KPIs are totals and counts.
      return { totalThisMonth: thisMonth, totalThisMonthUgx: thisMonth, countThisMonth: monthExpenses.length, totalOverall, totalOverallUgx: totalOverall, countOverall: items.length };
    },
  });
}

export function useExpense(id: string | undefined, _userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['expenses', 'detail', id, ctx.business_id],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => { const all = await listExpenses(ctx, { branch_id: branch as string | undefined }).then(unwrap); return (Array.isArray(all) ? all : []).find((e: any) => e.id === id) ?? null; },
    enabled: Boolean(id),
  });
}

// 2026-08-31: draft/pending-approval/approved/rejected/paid workflow removed
// at the user's explicit request - expenses now record directly (see
// engines/business/businessEngine.ts recordExpense, which already always
// wrote status: 'confirmed'; the UI just used to pretend otherwise).
// useApproveExpense/useRejectExpense/useSubmitExpense/useCancelExpense/
// useMarkExpensePaid are gone; useUpdateExpense/useDeleteExpense replace them.
export function useUpdateExpense(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateExpenseInput }) => updateExpense(ctx, id, patch).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); },
  });
}
export function useDeleteExpense(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(ctx, id).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); },
  });
}
export function useArchiveExpenseCategory(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('expense_categories')
        .update({ is_active: false })
        .eq('id', id).eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to archive category');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'categories'] }),
  });
}
export function useSaveExpenseSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseSettings) => saveExpenseSettingsLocal(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'settings'] }),
  });
}

export function useSpendByCategory(_branchId?: string, _from?: string, _to?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['expenses', 'by-category', ctx.business_id],
    queryFn: async () => {
      const all = await listExpenses(ctx, { branch_id: branch as string | undefined }).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = Array.isArray(all) ? all as any[] : [];
      const map = new Map<string, number>();
      for (const e of items) map.set(e.category ?? 'Other', (map.get(e.category ?? 'Other') ?? 0) + (e.total_amount ?? 0));
      return Array.from(map.entries()).map(([category, totalUgx], idx) => ({ category, categoryId: String(idx), categoryName: category, totalUgx, count: 0 }));
    },
  });
}

export function useRecurringTemplates() {
  return useQuery({ queryKey: ['expenses', 'recurring'], queryFn: () => listRecurringTemplatesLocal() });
}
export function useCreateRecurringTemplate(userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecurringExpenseInput) => createRecurringTemplateLocal(input, userId ?? ctx.user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'recurring'] }),
  });
}
export function useArchiveRecurringTemplate(userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await archiveRecurringTemplateLocal(id, userId ?? ctx.user_id); return { id }; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'recurring'] }),
  });
}
export function useGenerateDueRecurringExpenses(userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateDueRecurringExpensesLocal(userId ?? ctx.user_id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenses', 'recurring'] }); },
  });
}
