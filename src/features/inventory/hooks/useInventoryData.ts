// Stage 5: Inventory feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import {
  listProducts, getProduct, createProduct, updateProduct, softDeleteProduct,
  listCategories, createCategory, updateCategory, archiveCategory,
  listSuppliers, createSupplier, updateSupplier, archiveSupplier,
} from '../../../services/masterData/masterDataService';
import { listInventory, getInventoryMovements, createStockAdjustment, createStockTransfer } from '../../../services/inventory/inventoryService';
import type { UUID } from '../../../types/database';
import type { Product as InventoryProduct } from '../../../types/inventory';
import type { SupportedCurrency } from '../../../lib/currency';

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
function mapProduct(p: any): InventoryProduct {
  return {
    id: p.id, created_at: p.created_at ?? '', updated_at: p.updated_at ?? '',
    created_by: p.created_by ?? '', updated_by: p.updated_by ?? '',
    branch_id: p.branch_id ?? null, is_active: p.is_active ?? true,
    sync_status: 'synced' as const, last_synced_at: null,
    name: p.name ?? '', sku: p.sku ?? '', barcode: p.barcode ?? '',
    imageDataUrl: p.image_url ?? p.imageDataUrl ?? null,
    categoryId: p.category_id ?? p.categoryId ?? '',
    brandId: p.metadata?.brand_id ?? p.brandId ?? null,
    unitId: p.unit_id ?? p.unitId ?? '',
    supplierId: p.metadata?.supplier_id ?? p.supplierId ?? null,
    description: p.description ?? '', notes: p.metadata?.notes ?? p.notes ?? '',
    buyingPrice: p.cost_price ?? p.buyingPrice ?? 0,
    sellingPrice: p.selling_price ?? p.sellingPrice ?? 0,
    taxRateId: p.taxRateId ?? null,
    reorderLevel: p.reorder_level ?? p.reorderLevel ?? 0,
    openingStock: p.openingStock ?? 0,
    currentStock: p.currentStock ?? p.quantity_on_hand ?? 0,
    status: p.is_active ? 'active' : 'archived',
  };
}

export function useCategories() {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['inventory', 'categories', ctx.business_id], queryFn: () => listCategories(ctx).then(unwrap) });
}

export function useBrands() {
  return useQuery({ queryKey: ['inventory', 'brands'], queryFn: async () => [] as import('../../../types/inventory').Brand[], staleTime: Infinity });
}

export function useProducts(branchId?: UUID) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['inventory', 'products', ctx.business_id, branchId],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => (await listProducts(ctx).then(unwrap) as any[]).map(mapProduct),
  });
}

export function useProduct(id: string | undefined) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['inventory', 'product', id],
    queryFn: async () => { const p = await getProduct(ctx, id as UUID).then(unwrap); return p ? mapProduct(p) : null; },
    enabled: Boolean(id),
  });
}

export function useCreateProduct(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => createProduct(ctx, {
      name: input.name, sku: input.sku ?? null, barcode: input.barcode ?? null,
      description: input.description ?? null,
      category_id: (input.categoryId ?? input.category_id ?? null),
      unit_id: (input.unitId ?? input.unit_id ?? null),
      selling_price: input.sellingPrice ?? input.selling_price ?? 0,
      cost_price: input.buyingPrice ?? input.cost_price ?? 0,
      reorder_level: input.reorderLevel ?? input.reorder_level ?? 0,
      is_stockable: true, is_sellable: true, is_purchasable: true,
      is_active: true, track_expiry: false, tax_rate: 0,
      metadata: { brand_id: input.brandId ?? null, supplier_id: input.supplierId ?? null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'products'] }),
  });
}

export function useUpdateProduct(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ id, input }: { id: UUID; input: any }) => updateProduct(ctx, id, input as any).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'products'] }),
  });
}

export function useArchiveProduct(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: UUID) => softDeleteProduct(ctx, id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'products'] }) });
}

export function useSuppliers() {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['inventory', 'suppliers', ctx.business_id], queryFn: () => listSuppliers(ctx).then(unwrap) });
}

export function useCreateSupplier(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => createSupplier(ctx, { ...input, address: typeof input.address === 'string' ? { raw: input.address } : (input.address ?? null) } as any).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }),
  });
}

export function useUpdateSupplier(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ id, input }: { id: UUID; input: any }) => updateSupplier(ctx, id, { ...input, address: typeof input.address === 'string' ? { raw: input.address } : input.address } as any).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }),
  });
}

export function useArchiveSupplier(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: UUID) => archiveSupplier(ctx, id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }) });
}

export function useUnits() {
  // Stage 5 policy: Piece is the only active stock unit.
  // Unit conversion and configurable units are not supported.
  return useQuery({
    queryKey: ['inventory', 'units', 'piece-only'],
    queryFn: async () => ([{
      id:             'piece',
      name:           'Piece',
      abbreviation:   'pcs',
      is_active:      true,
      created_at:     '',
      updated_at:     '',
      created_by:     '',
      updated_by:     '',
      branch_id:      null as null,
      sync_status:    'synced' as const,
      last_synced_at: null as null,
    }] as import('../../../types/inventory').UnitOfMeasure[]),
    staleTime: Infinity,
  });
}

export function useInventoryKpis(_currency?: SupportedCurrency) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['inventory', 'kpis', ctx.business_id, branch],
    queryFn: async () => {
      const inv = await listInventory(ctx, { branch_id: branch ?? undefined }).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = Array.isArray(inv) ? inv as any[] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const low = items.filter((i: any) => i.is_low_stock).length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oos = items.filter((i: any) => (i.quantity_on_hand ?? 0) <= 0).length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = items.reduce((s: number, i: any) => s + (i.stock_value ?? 0), 0);
      const prods = await listProducts(ctx).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prodItems = Array.isArray(prods) ? prods as any[] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalRevPotential = prodItems.reduce((s: number, p: any) => s + ((p.selling_price ?? p.sellingPrice ?? 0) - (p.cost_price ?? p.buyingPrice ?? 0)) * Math.max(0, p.quantity_on_hand ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { totalProducts: items.length, lowStockItems: low, lowStockCount: low, outOfStockItems: oos, outOfStockCount: oos, totalValue: val, inventoryValue: val, potentialProfit: Math.max(0, totalRevPotential), categoriesCount: prodItems.length > 0 ? new Set(prodItems.map((p: any) => p.category_id).filter(Boolean)).size : 0, suppliersCount: 0 };
    },
  });
}

export function useProductStatistics() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['inventory', 'product-stats', ctx.business_id],
    queryFn: async () => {
      const products = await listProducts(ctx).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = Array.isArray(products) ? products as any[] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { total: items.length, active: items.filter((p: any) => p.is_active).length, archived: items.filter((p: any) => !p.is_active).length, mostExpensive: null, newest: null, averageMarginPercent: 0 };
    },
  });
}

export function useInventoryList(branchId?: UUID) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['inventory', 'list', ctx.business_id, branchId ?? branch],
    queryFn: () => listInventory(ctx, { branch_id: (branchId ?? branch) as string | undefined }).then(unwrap),
  });
}

export function useInventoryMovements(productId?: UUID) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const branchId = (branch ?? ctx.branch_id) as UUID | undefined;
  return useQuery({
    queryKey: ['inventory', 'movements', ctx.business_id, branchId, productId],
    queryFn: () => getInventoryMovements(ctx, { product_id: productId, branch_id: branchId as UUID }).then(unwrap),
    enabled: Boolean(branchId),
  });
}

export function useCreateStockAdjustment(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createStockAdjustment>[1]) => createStockAdjustment(ctx, input).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); },
  });
}

export function useCreateStockTransfer(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: Parameters<typeof createStockTransfer>[1]) => createStockTransfer(ctx, input).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }) });
}

export function useLowStockItems(branchId?: UUID) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['inventory', 'low-stock', ctx.business_id, branchId ?? branch],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => { const inv = await listInventory(ctx, { branch_id: (branchId ?? branch) as string | undefined }).then(unwrap); return (Array.isArray(inv) ? inv : []).filter((i: any) => i.is_low_stock); },
  });
}

export function useInventoryReports() {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['inventory', 'reports', ctx.business_id], queryFn: () => listInventory(ctx).then(unwrap) });
}

export function useInventoryValueTrend(_trendRange?: unknown, _currency?: unknown) {
  return useQuery({ queryKey: ['inventory', 'value-trend'], queryFn: async () => [] as Array<{ label: string; value: number }>, staleTime: 5 * 60_000 });
}

// Stubs
export function useLowStockReport(branchId?: UUID) { return useLowStockItems(branchId); }
export function useOutOfStockReport(branchId?: UUID) { return useLowStockItems(branchId); }
export function useStockSummary(branchId?: UUID) { return useInventoryList(branchId); }
export function useDeadStockReport(branchId?: UUID) { return useLowStockItems(branchId); }
export function useFastSlowMovingReport(branchId?: UUID) { return useInventoryList(branchId); }
export function useProfitabilityReport(branchId?: UUID) { return useInventoryList(branchId); }
export function useStockLevelsReport(branchId?: UUID) { return useInventoryList(branchId); }
export function useValuationReport(branchId?: UUID) { return useInventoryList(branchId); }
export const useDuplicateProduct = useCreateProduct;
export const useStockMovements = useInventoryMovements;
export function useReactivateProduct(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await (await import('../../../lib/supabase')).supabase.schema('imagecare').from('products').update({ is_active: true }).eq('id', id).eq('business_id', ctx.business_id); if (error) throw new Error((error as { message?: string }).message ?? 'Failed'); return { id }; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'products'] }),
  });
}
export function useCreateUnit(_userId?: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: { name: string; abbreviation?: string }) => ({ id: crypto.randomUUID(), ...input, is_active: true, created_at: '', updated_at: '', created_by: '', updated_by: '', branch_id: null as null, sync_status: 'synced' as const, last_synced_at: null as null } as import('../../../types/inventory').UnitOfMeasure), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'units'] }) });
}
export function useCreateAdjustment(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: any) => createStockAdjustment(ctx, {
      branch_id: (input.branch_id ?? input.branchId ?? branch ?? ctx.branch_id) as UUID,
      product_id: (input.product_id ?? input.productId) as UUID,
      quantity: (() => { const qty = Math.abs(input.quantity ?? input.adjustmentQuantity ?? 0); const isOut = input.direction === 'out' || input.type === 'damage' || input.type === 'loss'; return isOut ? -qty : qty; })(),
      reason: input.reason ?? input.type ?? 'Manual adjustment',
      notes: input.notes ?? undefined,
    }).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); },
  });
}
// Bug fix (Phase 6, item 5-class bug): useStockAdjustments previously
// delegated to useInventoryMovements(undefined), whose query was gated on
// `enabled: Boolean(productId)` - since no productId is ever passed here,
// the query never ran and the Stock Adjustments page was permanently
// empty. It also returned raw inventory_movements rows (product_id,
// quantity, moved_at) while StockAdjustmentsPage expects
// {id, productId, reason, quantityChange, createdAt}. Fixed with its own
// hook: enabled on branch_id (not productId), filtered to adjustment
// movements only, and mapped to the shape the page renders.
export function useStockAdjustments() {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const branchId = (branch ?? ctx.branch_id) as UUID | undefined;
  return useQuery({
    queryKey: ['inventory', 'movements', 'adjustments', ctx.business_id, branchId],
    queryFn: async () => {
      const rows = await getInventoryMovements(ctx, { branch_id: branchId as UUID }).then(unwrap);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = Array.isArray(rows) ? rows as any[] : [];
      return items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((m: any) => m.movement_type === 'adjustment_in' || m.movement_type === 'adjustment_out')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((m: any) => ({
          id: m.id,
          productId: m.product_id,
          reason: m.notes ?? 'Manual adjustment',
          quantityChange: m.movement_type === 'adjustment_out' ? -Number(m.quantity) : Number(m.quantity),
          createdAt: m.moved_at,
        }));
    },
    enabled: Boolean(branchId),
  });
}
export function useGeneratedSku() { return useQuery({ queryKey: ['inventory', 'sku-generator'], queryFn: async () => `SKU-${Date.now().toString(36).toUpperCase()}`, staleTime: 0 }); }
export function useArchiveBrand(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (id: string) => ({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }) }); }
export function useCreateBrand(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: { name: string }) => ({ id: crypto.randomUUID(), name: input.name, is_active: true, created_at: '', updated_at: '', created_by: '', updated_by: '', branch_id: null as null, sync_status: 'synced' as const, last_synced_at: null as null } as import('../../../types/inventory').Brand), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }) }); }
export function useUpdateBrand(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async ({ id, input }: { id: string; input: { name: string } }) => ({ id, name: input.name, is_active: true, created_at: '', updated_at: '', created_by: '', updated_by: '', branch_id: null as null, sync_status: 'synced' as const, last_synced_at: null as null } as import('../../../types/inventory').Brand), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }) }); }
export function useArchiveCategory(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveCategory(ctx, id as import('../../../types/database').UUID).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'categories'] }),
  });
}
export function useUpdateCategory(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; description?: string } }) =>
      updateCategory(ctx, id as import('../../../types/database').UUID, input).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'categories'] }),
  });
}
export function useMergeCategories(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async ({ sourceId: _s, targetId: _t }: { sourceId: string; targetId: string }) => ({}), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'categories'] }) }); }
export function useArchiveUnit(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (id: string) => ({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'units'] }) }); }
export function useUpdateUnit(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async ({ id, input }: { id: string; input: { name: string } }) => ({ id, ...input }), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'units'] }) }); }

export function useCreateCategory(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) => createCategory(ctx, input).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'categories'] }),
  });
}
