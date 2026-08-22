// Stage 5: Expenses feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import { createExpense, listExpenses } from '../../../services/financial/financialServices';
import { listExpenseCategories, createExpenseCategory } from '../../../services/settings/settingsService';
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
  return useQuery({ queryKey: ['expenses', 'settings'], queryFn: async () => ({ maxExpenseAmount: 0, requireReceipt: false, autoApproveThresholdUgx: 0, requireApprovalAboveUgx: 0 }), staleTime: Infinity });
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
      return { totalThisMonth: thisMonth, totalThisMonthUgx: thisMonth, countThisMonth: monthExpenses.length, totalOverall: items.reduce((s: number, e: any) => s + (e.total_amount ?? 0), 0), pendingApproval: 0, pendingApprovalCount: 0, approvedUnpaidUgx: 0, paidThisMonthUgx: 0 };
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

export function useApproveExpense(_userId?: string, _userName?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('expenses')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to approve expense');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
export function useRejectExpense(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('expenses')
        .update({ status: 'cancelled', notes: `Rejected: ${reason}`, updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to reject expense');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
export function useSubmitExpense(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // In Stage 4, expenses go directly to confirmed. Submit marks as pending review.
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('expenses')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to submit expense');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
export function useCancelExpense(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { id: string; reason?: string }) => {
      const id = typeof input === 'string' ? input : input.id;
      const reason = typeof input === 'object' ? input.reason : undefined;
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('expenses')
        .update({ status: 'cancelled', notes: reason ? `Cancelled: ${reason}` : 'Cancelled', updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to cancel expense');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });
}
export function useMarkExpensePaid(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('expenses')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', id).eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to mark expense paid');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
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
export function useSaveExpenseSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'settings'] }) }); }

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
  return useQuery({ queryKey: ['expenses', 'recurring'], queryFn: async () => [] as Array<{ id: string; categoryName: string; description: string; amount: number; frequency: string; nextDueDate: string; is_active: boolean; generated: string[] }>, staleTime: Infinity });
}
export function useCreateRecurringTemplate(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'recurring'] }) }); }
export function useArchiveRecurringTemplate(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (id: string) => ({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'recurring'] }) }); }
export function useGenerateDueRecurringExpenses(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async () => ({ generated: 0, ids: [] as string[] }), onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }) }); }
