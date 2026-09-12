// Stage 5: Credit feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import {
  getCustomerCredit, getOutstandingCredit, recordCreditPayment, listInvoices, recordInvoicePayment,
  writeOffCreditBalance, listCreditTransactions,
} from '../../../services/credit/creditService';
import { supabase } from '../../../lib/supabase';
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

// fn_get_outstanding_credit_summary returns {customer_id, customer_name,
// phone, credit_limit, credit_balance, utilization_pct}. Older consumers
// (ReportsPage) read `outstanding`/`current_balance`/`name` - keep those as
// aliases alongside the real field names so both shapes work off one query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withLegacyAliases(rows: any[]): any[] {
  return rows.map((r) => ({
    ...r,
    name: r.customer_name,
    outstanding: r.credit_balance,
    current_balance: r.credit_balance,
  }));
}

// Bug fix (2026-09-11, TestSprite: "Credit Accounts page ... required data
// is not present"): this used to silently fall back to the header's
// globally active branch (`useActiveBranch()`) whenever no branchId was
// explicitly passed - which is every real call site (ReportsPage,
// CreditDashboardPage, CreditAccountsPage all call these hooks with no
// arguments, and none of them has a branch selector of their own). Credit
// limits are set business-wide, not per branch, by explicit prior design
// (see claude/credit-dashboard-zero-balances-fix-2026-09-04.md - "business-
// wide, not branch-scoped, by design") - `imagecare.customers.branch_id` is
// never populated by the app. A real customer's credit_limit only ever gets
// a matching `credit_accounts` row for a branch once an actual credit SALE
// happens there, so any customer given a credit limit but never yet charged
// at whatever branch happens to be active in the header was silently
// invisible on every one of these three screens - confirmed live: 3 real
// customers with real limits (10,000 / 50,000 / 100,000 UGX) vanish the
// instant a specific branch is selected, and reappear only under "all
// branches" (branchId passed as NULL to the RPC). Since nothing here has a
// branch control the user can see or change, this was an invisible, unasked
// -for filter, not a deliberate scoping - now these hooks only scope by
// branch when a caller explicitly asks for it (no current caller does).
// Perf fix (2026-09-12): useOutstandingCredit, useCreditDashboardKpis and
// useCreditAccounts all call getOutstandingCredit(ctx, branchId) with
// identical args - CreditDashboardPage mounts useCreditDashboardKpis +
// useCreditAccounts together, and ReportsPage mounts useCreditDashboardKpis
// + useOutstandingCredit together, so this RPC used to fire 2x on every
// visit to either page. A shared `qc.fetchQuery` key means the second
// caller reuses the first's cached result. Lazy (returns a function, not a
// Promise) so it only runs when a caller's own queryFn actually invokes it -
// same pattern as the daily/monthly/annual summary KPI fetchers.
function useOutstandingCreditFetcher(branchId?: UUID) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return () =>
    qc.fetchQuery({
      queryKey: ['credit', 'outstanding-raw', ctx.business_id, branchId],
      queryFn: () => getOutstandingCredit(ctx, branchId).then(unwrap),
      staleTime: 30_000,
    });
}

export function useOutstandingCredit(branchId?: UUID) {
  const ctx = useUserContext();
  const fetchOutstanding = useOutstandingCreditFetcher(branchId);
  return useQuery({
    queryKey: ['credit', 'outstanding', ctx.business_id, branchId],
    queryFn: async () => {
      const rows = await fetchOutstanding();
      return withLegacyAliases(Array.isArray(rows) ? rows : []);
    },
  });
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
  const fetchOutstanding = useOutstandingCreditFetcher(branchId);
  return useQuery({
    queryKey: ['credit', 'kpis', ctx.business_id, branchId],
    queryFn: async () => {
      const outstanding = await fetchOutstanding();
      // Bug fix (2026-09-04): this always computed 0 for every KPI on the
      // Credit dashboard, even with real outstanding credit balances,
      // because it summed `r.outstanding` straight off the raw RPC rows -
      // fn_get_outstanding_credit_summary only returns `credit_balance`,
      // never an `outstanding` field. The `outstanding` alias only exists
      // after withLegacyAliases() runs (see useOutstandingCredit above,
      // which already calls it) - this hook fetched the same RPC directly
      // and skipped that step, so `r.outstanding` was always undefined and
      // every `?? 0` silently zeroed the total. Reuse the same aliasing so
      // both hooks read the same real field.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = withLegacyAliases(Array.isArray(outstanding) ? outstanding as any[] : []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = items.reduce((s: number, r: any) => s + (r.outstanding ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { totalOutstanding: total, totalOutstandingUgx: total, customersOnCredit: items.length, accountsWithBalance: items.filter((r: any) => (r.outstanding ?? 0) > 0).length, overdueCount: 0, overdueAccounts: 0, overdueAmountUgx: 0, paymentsThisMonthUgx: 0 };
    },
  });
}

// CreditAccountsPage.tsx expects each row shaped
// {customer: {id, name}, limit, available, balance, isOverdue, daysOutstanding}
// - map the RPC's flat customer_id/customer_name/credit_limit/credit_balance
// onto that. There's no due-date data on this RPC (it reads imagecare.customers,
// not credit_accounts.due_date), so isOverdue/daysOutstanding are reported
// honestly as false/0 rather than fabricated - "no overdue tracking here yet"
// is more honest than inventing a value with no data behind it.
export function useCreditAccounts(branchId?: UUID) {
  const ctx = useUserContext();
  const fetchOutstanding = useOutstandingCreditFetcher(branchId);
  return useQuery({
    queryKey: ['credit', 'accounts', ctx.business_id, branchId],
    queryFn: async () => {
      const rows = await fetchOutstanding();
      // The RPC only carries id/name for the customer, not every field the
      // (fairly loosely defined) CreditAccountRow['customer'] type declares -
      // CreditAccountsPage.tsx only ever reads .customer.id/.name (confirmed
      // by inspection), so the minimal real shape is cast rather than
      // over-fetching full customer rows this page doesn't use.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((Array.isArray(rows) ? rows : []).map((r: any) => ({
        customer: { id: r.customer_id, name: r.customer_name },
        limit: r.credit_limit ?? 0,
        balance: r.credit_balance ?? 0,
        available: Math.max((r.credit_limit ?? 0) - (r.credit_balance ?? 0), 0),
        isOverdue: false,
        daysOutstanding: 0,
      })) as unknown) as import('../../../services/creditService').CreditAccountRow[];
    },
  });
}

// useAgingReport removed (2026-09-04): it backed the "Reports" tab, which
// was removed at the user's request - it was a stub that always returned
// an empty result (no aging analysis was ever actually built behind it),
// so it only ever showed "Nothing outstanding" regardless of real credit
// balances.

export const useRecordPayment = useRecordCreditPayment;

// Real read backing "Payment history" on the Credit tab
// (src/pages/sales/CustomerDetailPage.tsx). Used to be aliased directly to
// useRecordCreditPayment, the MUTATION hook above - a fresh mutation's
// `.data` is always undefined, so the section could never show anything
// even after a payment was actually recorded. Filters
// listCreditTransactions() down to 'payment' rows and maps them onto the
// shape the page already renders (method/amount/reference/createdAt).
export function useCreditPayments(customerId: string | undefined) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['credit', 'payments', customerId, ctx.business_id],
    queryFn: async () => {
      const rows = (await listCreditTransactions(ctx, customerId as UUID).then(unwrap)) as Array<{
        id: string; transaction_type: string; amount: number;
        payment_method: string | null; reference_number: string | null; transaction_date: string;
      }>;
      return rows
        .filter((r) => r.transaction_type === 'payment')
        .map((r) => ({
          id:        r.id,
          method:    r.payment_method ?? 'cash',
          amount:    Number(r.amount),
          reference: r.reference_number ?? '',
          createdAt: r.transaction_date,
        }));
    },
    enabled: Boolean(customerId),
  });
}

// Bug fix (Save-button audit 2026-09-01): this used to update
// credit_accounts.credit_limit - but the limit shown everywhere
// (CustomerDetailPage, the outstanding-credit RPC) comes from
// customers.credit_limit. When no credit_accounts row exists yet for this
// customer (the common case - one isn't created until a charge or payment
// happens), the old update matched 0 rows and Supabase still reported
// success, so "Credit limit updated." was a false positive that changed
// nothing. Retargeted to customers, scoped the same way updateCustomer()
// does in src/services/masterData/masterDataService.ts.
export function useApproveCreditLimit(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: any) => {
      const customerId = input.customerId as UUID;
      const creditLimit = input.creditLimit ?? input.newLimit ?? 0;
      const { error } = await supabase
        .schema('imagecare')
        .from('customers')
        .update({ credit_limit: creditLimit, updated_at: new Date().toISOString() })
        .eq('id', customerId)
        .eq('business_id', ctx.business_id);
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to update credit limit');
      return { customerId, creditLimit };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit'] }),
  });
}

export function useCreditWriteOffs(_customerId?: UUID) {
  return useQuery({ queryKey: ['credit', 'writeoffs'], queryFn: async () => [] as Array<{ id: string; amount: number; date: string; createdAt: string; reason: string }> });
}

// Bug fix (Save-button audit 2026-09-01): this inserted
// `credit_account_id: input.customerId` - that FK points at
// credit_accounts.id, not customers.id, so every write-off either matched
// no account or (now that migration 0028 allows the 'write_off' type)
// would fail the FK constraint outright. Rewired to the real
// writeOffCreditBalance() service function, which resolves the real
// credit_account_id first via creditEngine.getOrCreateCreditAccount() -
// the same resolution recordCreditPayment()/processCreditRepayment() use -
// before writing the transaction.
export function useWriteOffBalance(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { customerId: UUID; amount: number; reason: string }) =>
      writeOffCreditBalance(ctx, {
        customer_id: input.customerId,
        branch_id:   (branch ?? ctx.branch_id) as UUID,
        amount:      input.amount,
        reason:      input.reason,
      }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credit'] }),
  });
}
