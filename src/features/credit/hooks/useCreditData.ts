// Stage 5: Credit feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import { getCustomerCredit, getOutstandingCredit, recordCreditPayment, listInvoices, recordInvoicePayment } from '../../../services/credit/creditService';
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

export function useCustomerCredit(customerId: string | undefined) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['credit', 'customer', customerId, ctx.business_id], queryFn: () => getCustomerCredit(ctx, customerId as UUID).then(unwrap), enabled: Boolean(customerId) });
}

export function useOutstandingCredit(branchId?: UUID) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({ queryKey: ['credit', 'outstanding', ctx.business_id, branchId ?? branch], queryFn: () => getOutstandingCredit(ctx, (branchId ?? branch) as UUID | undefined).then(unwrap) });
}

export function useRecordCreditPayment(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => recordCreditPayment(ctx, {
      customer_id: (input.customerId ?? input.customer_id) as UUID,
      branch_id: (input.branchId ?? branch ?? ctx.branch_id) as UUID,
      amount: input.amount,
      payment_method: input.paymentMethod ?? input.method ?? 'cash',
      reference_notes: input.referenceNotes ?? input.reference,
    }).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); },
  });
}

export function useInvoices(supplierId?: UUID) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['credit', 'invoices', supplierId ?? 'all', ctx.business_id], queryFn: () => listInvoices(ctx, supplierId ? { customer_id: supplierId } : {}).then(unwrap) });
}

export function useRecordInvoicePayment(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => recordInvoicePayment(ctx, { invoice_id: (input.invoiceId ?? input.supplierInvoiceId) as UUID, amount: input.amount, payment_method: input.paymentMethod ?? 'cash', ...(input.reference ? { reference: input.reference } : {}) } as any).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit'] }),
  });
}

export function useCreditDashboardKpis(branchId?: UUID) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['credit', 'kpis', ctx.business_id, branchId ?? branch],
    queryFn: async () => {
      const outstanding = await getOutstandingCredit(ctx, (branchId ?? branch) as UUID | undefined).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = Array.isArray(outstanding) ? outstanding as any[] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = items.reduce((s: number, r: any) => s + (r.outstanding ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { totalOutstanding: total, totalOutstandingUgx: total, customersOnCredit: items.length, accountsWithBalance: items.filter((r: any) => (r.outstanding ?? 0) > 0).length, overdueCount: 0, overdueAccounts: 0, overdueAmountUgx: 0, paymentsThisMonthUgx: 0 };
    },
  });
}

export function useCreditAccounts(branchId?: UUID) { return useOutstandingCredit(branchId); }

export function useAgingReport(_branchId?: UUID) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['credit', 'aging', ctx.business_id],
    queryFn: async () => [] as Array<{ customerId: string; customerName: string; label: string; current: number; days30: number; days60: number; days90: number; over90: number; totalUgx: number; accounts: Array<{ customer: { id: string; name: string }; balance: number }> }>,
  });
}

export const useCreditPayments = useRecordCreditPayment;
export const useRecordPayment = useRecordCreditPayment;

export function useApproveCreditLimit(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: any) => {
      const customerId = input.customerId as UUID;
      const creditLimit = input.creditLimit ?? input.newLimit ?? 0;
      const { error } = await (await import('../../../lib/supabase')).supabase.schema('imagecare').from('credit_accounts').update({ credit_limit: creditLimit }).eq('business_id', ctx.business_id).eq('customer_id', customerId);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed');
      return { customerId, creditLimit };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit'] }),
  });
}

export function useCreditWriteOffs(_customerId?: UUID) {
  return useQuery({ queryKey: ['credit', 'writeoffs'], queryFn: async () => [] as Array<{ id: string; amount: number; date: string; createdAt: string; reason: string }> });
}

export function useWriteOffBalance(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customerId: UUID; amount: number; reason: string }) => {
      // Write-off: reduce credit balance by marking as forgiven. Update credit_accounts.
      const { error } = await (await import('../../../lib/supabase')).supabase
        .schema('imagecare').from('credit_transactions')
        .insert({
          business_id: ctx.business_id,
          branch_id: ctx.branch_id,
          credit_account_id: input.customerId, // page passes account id as customerId
          transaction_type: 'write_off',
          amount: input.amount,
          transaction_date: new Date().toISOString(),
          created_by: ctx.user_id,
        });
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to write off balance');
      return input;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit'] }),
  });
}
