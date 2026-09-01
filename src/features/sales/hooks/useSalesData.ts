// Stage 5: Sales feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import {
  listCustomers, getCustomer, createCustomer, updateCustomer,
  archiveCustomer, reactivateCustomer, listCustomerNotes, addCustomerNote, findCustomerDuplicates,
} from '../../../services/masterData/masterDataService';
import { createSale, listSales, getSale, cancelSale } from '../../../services/sales/salesService';
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
function mapCustomer(c: any): SalesCustomer {
  return {
    id: c.id, created_at: c.created_at ?? '', updated_at: c.updated_at ?? '',
    created_by: c.created_by ?? '', updated_by: c.updated_by ?? '',
    branch_id: c.branch_id ?? null, is_active: c.is_active ?? true,
    sync_status: 'synced' as const, last_synced_at: null,
    name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '',
    address: typeof c.address === 'string' ? c.address : (c.address ? JSON.stringify(c.address) : ''),
    notes: c.notes ?? '', tags: c.tags ?? [], status: 'active' as const,
    dateOfBirth: null, preferredBranchId: null, preferredPaymentMethod: null,
    creditLimit: c.credit_limit ?? 0, loyaltyPoints: 0,
    lifetimePurchases: 0, creditBalance: c.credit_balance ?? 0,
  };
}

export function useCustomers() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'customers', ctx.business_id],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => (await listCustomers(ctx).then(unwrap) as any[]).map(mapCustomer),
  });
}

export function useCustomer(id: string | undefined) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'customer', id],
    queryFn: async () => { const c = await getCustomer(ctx, id as UUID).then(unwrap); return c ? mapCustomer(c) : null; },
    enabled: Boolean(id),
  });
}

export function useCreateCustomer(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: any) => createCustomer(ctx, {
      ...input,
      address: typeof input.address === 'string' ? { raw: input.address } : (input.address ?? null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'customers'] }),
  });
}

export function useUpdateCustomer(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ id, input }: { id: UUID; input: any }) => updateCustomer(ctx, id, {
      ...input,
      address: typeof input.address === 'string' ? { raw: input.address } : input.address,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).then(unwrap),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales'] }),
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
      const customers = (Array.isArray(raw) ? raw : []).map(mapCustomer);
      const thirtyAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
      const new30 = customers.filter(c => (c.created_at ?? '') > thirtyAgo).length;
      return {
        totalCustomers: customers.length, activeCustomers: customers.filter(c => c.is_active).length,
        newCustomers30d: new30, activeCustomers30d: customers.filter(c => c.is_active).length,
        lifetimeValueUgx: customers.reduce((s, c) => s + c.lifetimePurchases, 0),
        outstandingCreditUgx: customers.reduce((s, c) => s + c.creditBalance, 0),
        loyaltyMembers: 0,
      };
    },
  });
}

export function useSales() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'sales', ctx.business_id],
    queryFn: () => listSales(ctx).then(unwrap),
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

export function useParkedSales() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['sales', 'parked', ctx.business_id],
    queryFn: async () => {
      const all = await listSales(ctx).then(unwrap);
      return (Array.isArray(all) ? all : []).filter((s: { status: string }) => s.status === 'draft');
    },
  });
}

export interface CheckoutInput {
  customerId: string | null; salesPersonId: string | null; branchId: string | null;
  items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; costPrice?: number }>;
  discountPercent: number; taxRateId: string | null; paymentMethod: string;
  amountTendered: number | null; paymentReference: string | null; status: 'completed' | 'parked';
}

export function useCheckout(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) => {
      const subtotal = input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const discountAmt = Math.round((subtotal * input.discountPercent) / 100);
      const total = subtotal - discountAmt;
      const isCredit = input.paymentMethod === 'credit';
      const saleCtx: UserContext = ctx;
      return createSale(saleCtx, {
        branch_id:      (input.branchId ?? branch ?? ctx.branch_id) as UUID,
        payment_method: input.paymentMethod as 'cash' | 'mobile_money' | 'bank_transfer' | 'card' | 'credit',
        customer_id:    (input.customerId ?? undefined) as UUID | undefined,
        amount_paid:    isCredit ? 0 : (input.amountTendered ?? total),
        change_given:   isCredit ? 0 : Math.max(0, (input.amountTendered ?? total) - total),
        credit_amount:  isCredit ? total : 0,
        notes:          input.paymentReference ?? undefined,
        items: input.items.map(i => ({ product_id: i.productId as UUID, quantity: i.quantity, unit_price: i.unitPrice, unit_cost: i.costPrice ?? 0 })),
      }).then(unwrap);
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
    },
  });
}

export function useRefundSale(_userId?: string) {
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
      return { id, items: s?.items ?? s?.sale_items ?? [], discountPercent: 0, taxRateId: null, paymentMethod: s?.payment_method ?? 'cash', customerId: s?.customer_id ?? null, status: 'draft' };
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
