// Stage 5: Sales feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import {
  listCustomers, getCustomer, createCustomer, updateCustomer,
  archiveCustomer, reactivateCustomer, listCustomerNotes, addCustomerNote, findCustomerDuplicates,
} from '../../../services/masterData/masterDataService';
import { createSale, listSales, getSale, cancelSale } from '../../../services/sales/salesService';
import {
  listLoyaltyAccounts as listLoyaltyAccountsReal,
  getLoyaltyAccountByCustomer as getLoyaltyAccountByCustomerReal,
  awardLoyaltyPoints,
} from '../../../services/loyalty/loyaltyService';
import { getLoyaltySettings } from '../../../services/loyaltyService';
import type { UUID } from '../../../types/database';
import type { Customer as SalesCustomer } from '../../../types/sales';
import type { UserContext } from '../../../types/app';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readAddress(address: any): string {
  if (typeof address === 'string') return address;
  if (!address || typeof address !== 'object') return '';
  if (typeof address.raw === 'string') return address.raw;
  return Object.keys(address).length > 0 ? JSON.stringify(address) : '';
}

// Bug fix (2026-09-05): loyaltyPoints was hardcoded to 0 here always - the
// real balance lives in imagecare.loyalty_accounts.points_balance (a
// separate table, joined in by caller), not on the customers row itself.
// A customer who has genuinely earned points (see fn_award_loyalty_points)
// was still shown "0 pts" everywhere (Customer Detail's Loyalty tab, the
// Redeem points picker) because of this. loyaltyPoints is now a parameter
// instead of a hardcoded literal; callers that don't have a real balance
// handy (create/update customer, CRM KPIs) still default to 0, which is
// correct for those cases since nothing there changes an existing balance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCustomer(c: any, loyaltyPoints = 0): SalesCustomer {
  return {
    id: c.id, created_at: c.created_at ?? '', updated_at: c.updated_at ?? '',
    created_by: c.created_by ?? '', updated_by: c.updated_by ?? '',
    branch_id: c.branch_id ?? null, is_active: c.is_active ?? true,
    sync_status: 'synced' as const, last_synced_at: null,
    name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '',
    // customers.address is JSONB; the write side stores a typed-in address
    // as { raw: '...' }, so unwrap that back to plain text instead of
    // showing the user '{"raw":"..."}'.
    address: readAddress(c.address),
    notes: c.notes ?? '', tags: c.tags ?? [], status: 'active' as const,
    dateOfBirth: null, preferredBranchId: null, preferredPaymentMethod: null,
    creditLimit: c.credit_limit ?? 0, loyaltyPoints,
    lifetimePurchases: 0, creditBalance: c.credit_balance ?? 0,
  };
}

export function useCustomers() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'customers', ctx.business_id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (await listCustomers(ctx).then(unwrap)) as any[];
      // Best-effort: the customer list itself must still render even if
      // this second, loyalty-specific read fails for any reason.
      const accounts: Array<{ customer_id: string; points_balance: number }> = await listLoyaltyAccountsReal(ctx, { is_active: true })
        .then((r) => (r.error ? [] : r.data ?? []))
        .catch(() => []);
      const pointsByCustomer = new Map<string, number>(accounts.map((a): [string, number] => [a.customer_id, a.points_balance]));
      return rows.map((c) => mapCustomer(c, pointsByCustomer.get(c.id) ?? 0));
    },
  });
}

export function useCustomer(id: string | undefined) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'customer', id],
    queryFn: async () => {
      const c = await getCustomer(ctx, id as UUID).then(unwrap);
      if (!c) return null;
      const account = await getLoyaltyAccountByCustomerReal(ctx, id as UUID)
        .then((r) => (r.error ? null : r.data))
        .catch(() => null);
      return mapCustomer(c, account?.points_balance ?? 0);
    },
    enabled: Boolean(id),
  });
}

export function useCreateCustomer(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // 2026-09-03: this used to return the raw Supabase row, skipping
    // mapCustomer() entirely - so the customer handed back to the caller
    // (PointOfSalePage selects it into the sale straight away) had no
    // creditLimit/creditBalance/status at all, only snake_case DB columns.
    // Reads went through mapCustomer, writes didn't; now both do.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: any) => {
      const row = await createCustomer(ctx, {
        ...input,
        address: typeof input.address === 'string' ? { raw: input.address } : (input.address ?? null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).then(unwrap);
      if (!row || Array.isArray(row)) throw new Error('The customer was not saved. Please try again.');
      return mapCustomer(row);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  });
}

export function useUpdateCustomer(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ id, input }: { id: UUID; input: any }) => {
      const row = await updateCustomer(ctx, id, {
        ...input,
        address: typeof input.address === 'string' ? { raw: input.address } : input.address,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).then(unwrap);
      if (!row || Array.isArray(row)) throw new Error('The customer was not saved. Please try again.');
      return mapCustomer(row);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  });
}

export function useArchiveCustomer(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: UUID) => archiveCustomer(ctx, id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }) });
}

export function useReactivateCustomer(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: UUID) => reactivateCustomer(ctx, id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }) });
}

export function useMergeCustomers(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceId, targetId: _t }: { sourceId: UUID; targetId: UUID }) => archiveCustomer(ctx, sourceId).then(unwrap),
    // Only the customers list changes here (source customer archived) -
    // invalidating the whole ['sales'] key was forcing every sale, parked
    // sale, and CRM KPI query to refetch for no reason.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  });
}

export function useFindDuplicateCustomers() {
  const ctx = useUserContext();
  return useMutation({
    mutationFn: (input: { name?: string; phone?: string; email?: string }) =>
      findCustomerDuplicates(ctx, input).then(unwrap),
  });
}

export function useCustomerNotes(customerId: string | undefined) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'customer-notes', customerId],
    queryFn: () => listCustomerNotes(ctx, customerId as UUID).then(unwrap),
    enabled: Boolean(customerId),
  });
}

export function useAddCustomerNote(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, text }: { customerId: UUID; text: string }) => addCustomerNote(ctx, customerId, text).then(unwrap),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['sales', 'customer-notes', v.customerId] }),
  });
}

export function useCrmKpis() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'crm-kpis', ctx.business_id],
    queryFn: async () => {
      const raw = await listCustomers(ctx).then(unwrap);
      const customers = (Array.isArray(raw) ? raw : []).map((c) => mapCustomer(c));
      const thirtyAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
      const new30 = customers.filter(c => (c.created_at ?? '') > thirtyAgo).length;
      // Bug fix (2026-09-05): hardcoded to 0 - now a real count of
      // enrolled loyalty accounts with a positive balance (see
      // fn_award_loyalty_points). Best-effort, same reasoning as useCustomers.
      const loyaltyAccounts: Array<{ points_balance: number }> = await listLoyaltyAccountsReal(ctx, { is_active: true })
        .then((r) => (r.error ? [] : r.data ?? []))
        .catch(() => []);
      return {
        totalCustomers: customers.length, activeCustomers: customers.filter(c => c.is_active).length,
        newCustomers30d: new30, activeCustomers30d: customers.filter(c => c.is_active).length,
        lifetimeValueUgx: customers.reduce((s, c) => s + c.lifetimePurchases, 0),
        outstandingCreditUgx: customers.reduce((s, c) => s + c.creditBalance, 0),
        loyaltyMembers: loyaltyAccounts.filter((a) => a.points_balance > 0).length,
      };
    },
  });
}

// Bug fix (2026-09-06): "when I click branch Machakos, I keep seeing the
// same sales from Nkoowe." listSales() (services/sales/salesService.ts)
// already supports a branch_id filter, but this hook never passed one, so
// the Sales page's table always showed every branch's sales together no
// matter which branch was selected in the header - the one part of that
// page that wasn't actually branch-aware, unlike Inventory/Dashboard/
// Reports/Expenses/Credit/Purchasing etc. (all scoped via useActiveBranch()
// already). `branchId` is opt-in (undefined by default) rather than always
// reading useActiveBranch() internally, because two existing callers
// genuinely need the UNFILTERED, all-branch list: CustomerDetailPage.tsx
// (a customer's full purchase history, wherever they bought) and
// ReportsPage.tsx's SalesReport(). Only the till (PointOfSalePage.tsx)
// passes the header's active branch in.
export function useSales(options?: { branchId?: UUID | null }) {
  const ctx = useUserContext();
  const branchId = options?.branchId ?? null;
  return useQuery({
    queryKey: ['sales', 'sales', ctx.business_id, branchId],
    queryFn: () => listSales(ctx, branchId ? { branch_id: branchId } : {}).then(unwrap),
  });
}

export function useSale(id: string | undefined) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'sale', id],
    queryFn: () => getSale(ctx, id as UUID).then(unwrap),
    enabled: Boolean(id),
  });
}

// Same branch-filter opt-in as useSales() above, and for the same reason -
// the till's "On Hold" list should follow the header's selected branch,
// while nothing else currently calls this with a branch in mind.
export function useParkedSales(options?: { branchId?: UUID | null }) {
  const ctx = useUserContext();
  const branchId = options?.branchId ?? null;
  return useQuery({
    queryKey: ['sales', 'parked', ctx.business_id, branchId],
    queryFn: async () => {
      const all = await listSales(ctx, branchId ? { branch_id: branchId } : {}).then(unwrap);
      return (Array.isArray(all) ? all : []).filter((s: { status: string }) => s.status === 'draft');
    },
  });
}

export interface CheckoutInput {
  customerId: string | null; salesPersonId: string | null; branchId: string | null;
  items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; costPrice?: number }>;
  // Bug fix (2026-09-06): "i do not want the discount in a percentage
  // form" - renamed from discountPercent. This is now a flat currency
  // amount off the whole cart (e.g. 10000 = "USh 10,000 off"), not a
  // percentage - matches how PointOfSalePage.tsx now collects it. Also
  // fixes a deeper issue found alongside this: this value previously
  // never reached createSale() at all (see discount_amount below), so
  // whatever discount the cashier applied never actually reduced the
  // saved sale, the posted revenue, or the receipt total - only the
  // on-screen preview reflected it.
  discountAmount: number; taxRateId: string | null; paymentMethod: string;
  amountTendered: number | null; paymentReference: string | null; status: 'completed' | 'parked';
}

export function useCheckout(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const subtotal = input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      // Never trust the client past the wall: clamp here too, same rule
      // the engine itself enforces (see the discount validation in
      // createSale(), engines/business/businessEngine.ts) - a discount
      // can't be negative or bigger than the sale it's discounting.
      const discountAmt = Math.min(Math.max(0, Math.round(input.discountAmount)), subtotal);
      const total = subtotal - discountAmt;
      const isCredit = input.paymentMethod === 'credit';
      const saleCtx: UserContext = ctx;
      const sale = await createSale(saleCtx, {
        branch_id:      (input.branchId ?? branch ?? ctx.branch_id) as UUID,
        payment_method: input.paymentMethod as 'cash' | 'mobile_money' | 'bank_transfer' | 'card' | 'credit',
        customer_id:    (input.customerId ?? undefined) as UUID | undefined,
        amount_paid:    isCredit ? 0 : (input.amountTendered ?? total),
        change_given:   isCredit ? 0 : Math.max(0, (input.amountTendered ?? total) - total),
        credit_amount:  isCredit ? total : 0,
        // Bug fix (2026-09-06): see CreateSaleCommand.discount_amount in
        // engines/types.ts - this is the piece that was missing; without
        // it the engine always priced the sale at full subtotal.
        discount_amount: discountAmt,
        notes:          input.paymentReference ?? undefined,
        // Bug fix (2026-09-05): checkout captured "Sold by" but never
        // saved it - see claude/sales-targets-dashboard-fix-2026-09-05.md.
        served_by:      (input.salesPersonId ?? undefined) as UUID | undefined,
        items: input.items.map(i => ({ product_id: i.productId as UUID, quantity: i.quantity, unit_price: i.unitPrice, unit_cost: i.costPrice ?? 0 })),
      }).then(unwrap);

      // Bug fix (2026-09-05): completing a sale never awarded any real
      // loyalty points - see claude/loyalty-not-connected-to-sales-fix-
      // 2026-09-05.md. Only a completed sale (not a parked one) with a
      // customer attached qualifies, matching "points awarded after
      // completed sales" / "only registered customers earn points."
      // Best-effort: a loyalty hiccup must never undo or block a sale
      // that has already been recorded and paid for.
      if (input.status === 'completed' && input.customerId && sale?.sale_id) {
        try {
          const settings = await getLoyaltySettings();
          const amountUgx = typeof sale.total_amount === 'number' && sale.total_amount > 0 ? sale.total_amount : total;
          await awardLoyaltyPoints(saleCtx, input.customerId as UUID, sale.sale_id as UUID, amountUgx, settings.ugxPerPoint);
        } catch {
          // Sale already succeeded; the loyalty award can be retried by
          // support if needed, it must not surface as a checkout failure.
        }
      }

      return sale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      // 2026-09-01: 'recent-sales' is its own separate query key (see
      // useRecentSales in useDashboardData.ts) - it was never invalidated
      // here, so the Dashboard's Recent Sales list only picked up a just-
      // completed sale after its own 60s refetchInterval happened to fire,
      // not immediately. Needed now that Complete Sale navigates straight
      // to the Dashboard to show the sale that was just recorded.
      qc.invalidateQueries({ queryKey: ['recent-sales'] });
      // 2026-09-05: a completed sale can now award real loyalty points -
      // refresh the Loyalty pages and the customer list (loyaltyPoints)
      // so the award is visible without a manual refresh.
      qc.invalidateQueries({ queryKey: ['loyalty'] });
      qc.invalidateQueries({ queryKey: ['sales', 'customers'] });
      qc.invalidateQueries({ queryKey: ['sales', 'crm-kpis'] });
    },
  });
}

// 2026-09-01: renamed from useRefundSale - there is no separate "refund"
// feature (the old one called an RPC, engine_return_sale, that never
// existed in the database, so it never actually worked). This deletes a
// completed sale outright: cancelSale() now routes confirmed sales
// through the real reversal engine, which puts stock back and reverses
// the journal and cash/credit effects together.
export function useDeleteSale(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, reason }: { saleId: UUID; reason: string }) => cancelSale(ctx, saleId, reason).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
  });
}

export function useResumeParkedSale() {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID) => {
      const sale = await getSale(ctx, id).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = sale as any;
      // Bug fix (2026-09-06): renamed from discountPercent (see
      // CheckoutInput above) and now actually restores the parked sale's
      // real discount_amount instead of hardcoding 0 - now that a
      // discount genuinely reaches the saved sale, resuming a parked
      // sale that had one applied must bring it back too, or it would
      // silently disappear the moment the sale is resumed and completed.
      return { id, items: s?.items ?? s?.sale_items ?? [], discountAmount: Number(s?.discount_amount ?? 0), taxRateId: null, paymentMethod: s?.payment_method ?? 'cash', customerId: s?.customer_id ?? null, status: 'draft' };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'parked'] }),
  });
}

export function useDeleteParkedSale() {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => cancelSale(ctx, id, 'Parked sale deleted').then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'parked'] }),
  });
}
