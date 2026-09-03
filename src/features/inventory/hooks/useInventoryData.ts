// Stage 5: Inventory feature hooks - rewired to Stage 4 services.
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useUserContext, useActiveBranch } from '../../../context/AppContext';
import {
  listProducts, getProduct, createProduct, updateProduct, softDeleteProduct,
  listCategories, createCategory, updateCategory, archiveCategory, mergeCategories,
  listUnits, createUnit, updateUnit, archiveUnit,
  listSuppliers, createSupplier, updateSupplier, archiveSupplier,
} from '../../../services/masterData/masterDataService';
import { listInventory, getStock, getInventoryMovements, createStockAdjustment, createStockTransfer, recordOpeningStock } from '../../../services/inventory/inventoryService';
import { listBrands, createBrand, updateBrand, archiveBrand } from '../../../services/brandService';
import type { UUID } from '../../../types/database';
import type { Product as InventoryProduct, Supplier as InventorySupplier } from '../../../types/inventory';
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

// 2026-09-02: this used to always return [] (staleTime: Infinity, so it
// never even refetched), while useCreateBrand/useUpdateBrand/useArchiveBrand
// fabricated in-memory-only objects that touched no storage at all - not
// even IndexedDB - so a saved brand vanished on refresh, on top of never
// showing up in this list. There is no imagecare.brands table (Stage 4
// note in masterDataService.ts), so this can't go through Supabase without
// a schema change, which is out of scope here. brandService.ts already has
// a genuine IndexedDB-backed CRUD implementation (same getCollection/
// setCollection pattern as expenseService.ts) that nothing was calling -
// wiring these hooks to it is an honest local persistence fix: it won't
// sync across devices, but it survives a browser refresh, unlike before.
export function useBrands() {
  return useQuery({ queryKey: ['inventory', 'brands'], queryFn: () => listBrands() });
}

// 2026-09-01: listProducts() only ever selected from the products table
// (plus joined category/unit names) - it never included quantity_on_hand,
// so `currentStock` fell back to 0 for every product, always, regardless
// of any real movements (opening stock, purchases, sales, adjustments).
// Stock is deliberately never a column on products (see inventoryEngine's
// own rule) - it has to come from vw_stock_summary via listInventory(),
// same view the Inventory dashboard already reads. Not branch-filtered
// here (this list is company-wide across branches) - summed per product
// so "in stock" reflects the real total, not always zero.
export function useProducts(branchId?: UUID) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['inventory', 'products', ctx.business_id, branchId],
    queryFn: async () => {
      const [products, stockRows] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listProducts(ctx).then(unwrap) as Promise<any[]>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listInventory(ctx, branchId ? { branch_id: branchId } : {}, { page_size: 500 }).then(unwrap) as Promise<any[]>,
      ]);
      const stockByProduct = new Map<string, number>();
      for (const row of Array.isArray(stockRows) ? stockRows : []) {
        const key = row.product_id as string;
        stockByProduct.set(key, (stockByProduct.get(key) ?? 0) + Number(row.quantity_on_hand ?? 0));
      }
      return products.map((p) => mapProduct({ ...p, currentStock: stockByProduct.get(p.id) ?? 0 }));
    },
  });
}

export function useProduct(id: string | undefined) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  return useQuery({
    queryKey: ['inventory', 'product', id, branch],
    queryFn: async () => {
      const p = await getProduct(ctx, id as UUID).then(unwrap);
      if (!p) return null;
      // getStock() legitimately "fails" with RESOURCE_NOT_FOUND when a
      // product has zero movements yet - that's not an error, it just
      // means zero stock, so this reads the result directly instead of
      // going through unwrap() (which would throw on ANY error, turning
      // a brand-new, never-moved product into a broken detail page).
      let currentStock = 0;
      if (branch) {
        const stockResult = await getStock(ctx, id as UUID, branch as UUID);
        if (stockResult.data) currentStock = Number(stockResult.data.quantity_on_hand ?? 0);
      }
      return mapProduct({ ...p, currentStock });
    },
    enabled: Boolean(id),
  });
}

export function useCreateProduct(_userId?: string) {
  const ctx = useUserContext();
  const branch = useActiveBranch();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: any) => {
      const costPrice = input.buyingPrice ?? input.cost_price ?? 0;
      // 2026-09-01: barcode is optional, and an untouched field submits as
      // '' (empty string), not null/undefined - `?? null` only replaces
      // null/undefined, so every product saved with barcode left blank was
      // sending literal ''. products has a partial unique index on
      // (business_id, barcode) that correctly excludes NULL rows from the
      // uniqueness check (so many products can have "no barcode") but does
      // NOT exclude '' - '' is a real, indexed value, so the SECOND product
      // ever saved without a barcode collided with the first and failed
      // with "duplicate key value violates unique constraint
      // idx_s2_products_barcode" (confirmed live). Same treatment for sku,
      // even though the form currently requires one, so this can't recur
      // if that ever changes.
      const barcode = typeof input.barcode === 'string' ? input.barcode.trim() : input.barcode;
      const sku = typeof input.sku === 'string' ? input.sku.trim() : input.sku;
      const product = await createProduct(ctx, {
        name: input.name, sku: sku || null, barcode: barcode || null,
        description: input.description ?? null,
        category_id: (input.categoryId ?? input.category_id ?? null),
        unit_id: (input.unitId ?? input.unit_id ?? null),
        selling_price: input.sellingPrice ?? input.selling_price ?? 0,
        cost_price: costPrice,
        reorder_level: input.reorderLevel ?? input.reorder_level ?? 0,
        is_stockable: true, is_sellable: true, is_purchasable: true,
        is_active: true, track_expiry: false, tax_rate: 0,
        metadata: { brand_id: input.brandId ?? null, supplier_id: input.supplierId ?? null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).then(unwrap);

      // 2026-09-01: Opening stock used to be silently dropped here - the
      // product insert above has nowhere to put it (stock is derived from
      // inventory_movements, never a column on products - see the engine's
      // own rule). Every new product showed "0 in stock" right after being
      // saved, no matter what was entered. This is the fix: if a non-zero
      // opening count was entered, record it as a real opening_stock
      // movement right after the product exists. Best-effort - the product
      // itself is already saved and must not disappear if this part fails,
      // so a failure here is swallowed rather than surfaced as "Save
      // failed" for what is otherwise a successful product creation.
      const openingStock = input.openingStock ?? input.opening_stock ?? 0;
      const branchId = (input.branch_id ?? branch ?? ctx.branch_id) as UUID | null;
      if (openingStock > 0 && branchId) {
        try {
          const stockResult = await recordOpeningStock(ctx, {
            branch_id: branchId,
            product_id: product.id as UUID,
            quantity: openingStock,
            unit_cost: costPrice,
          });
          if (stockResult.error) {
            console.error('Opening stock was not recorded for new product', product.id, stockResult.error);
          }
        } catch (err) {
          // Product already saved; stock can still be fixed via Stock
          // Adjustments. Swallowed deliberately - see comment above.
          console.error('Opening stock was not recorded for new product', product.id, err);
        }
      }

      return product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', 'products'] });
      qc.invalidateQueries({ queryKey: ['inventory', 'movements'] });
    },
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

// 2026-09-03: supplier rows used to reach the UI completely unmapped -
// useSuppliers() returned raw database rows while every consumer reads the
// app-shape Supplier (types/inventory.ts). A raw row has contact_person and
// is_active; it has no contactName and no status at all, so
// `suppliers.filter(s => s.status === 'active')` - the filter behind the
// supplier dropdown on Purchase Orders, Requisitions, Supplier Invoices,
// Purchase Returns, the Purchasing dashboard, Payables and Bills reports -
// always matched nothing, and the Suppliers page rendered an empty status
// badge and an empty contact line. This mapper is the counterpart of
// mapCustomer() in useSalesData.ts: the row is translated once, here, so no
// call site has to know about column names.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readAddress(address: any): string {
  if (typeof address === 'string') return address;
  if (!address || typeof address !== 'object') return '';
  if (typeof address.raw === 'string') return address.raw;
  return Object.keys(address).length > 0 ? JSON.stringify(address) : '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSupplier(s: any): InventorySupplier {
  return {
    id: s.id, created_at: s.created_at ?? '', updated_at: s.updated_at ?? '',
    created_by: s.created_by ?? '', updated_by: s.updated_by ?? '',
    branch_id: s.branch_id ?? null, is_active: s.is_active ?? true,
    sync_status: 'synced' as const, last_synced_at: null,
    name: s.name ?? '',
    contactName: s.contact_person ?? s.contactName ?? '',
    phone: s.phone ?? '', email: s.email ?? '', tin: s.tin ?? '',
    // suppliers.address is JSONB; a typed-in address is written as
    // { raw: '...' } by the mutations below.
    address: readAddress(s.address),
    notes: s.notes ?? '',
    // There is no `status` column: is_active is the real toggle, and
    // 'active' | 'inactive' is exactly what it means.
    status: (s.is_active ?? true) ? 'active' : 'inactive',
  };
}

export function useSuppliers() {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['inventory', 'suppliers', ctx.business_id],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => (await listSuppliers(ctx).then(unwrap) as any[]).map(mapSupplier),
  });
}

export function useCreateSupplier(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // Returns a mapped supplier, not the raw row: SupplierInvoiceModal's
    // inline "add supplier" selects the result immediately.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await createSupplier(ctx, { ...input, address: typeof input.address === 'string' ? { raw: input.address } : (input.address ?? null) } as any).then(unwrap);
      if (!row || Array.isArray(row)) throw new Error('The supplier was not saved. Please try again.');
      return mapSupplier(row);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }),
  });
}

export function useUpdateSupplier(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ id, input }: { id: UUID; input: any }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await updateSupplier(ctx, id, { ...input, address: typeof input.address === 'string' ? { raw: input.address } : input.address } as any).then(unwrap);
      if (!row || Array.isArray(row)) throw new Error('The supplier was not saved. Please try again.');
      return mapSupplier(row);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }),
  });
}

export function useArchiveSupplier(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: UUID) => archiveSupplier(ctx, id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }) });
}

export function useUnits() {
  // 2026-09-01: this used to hardcode a single fake "Piece" unit with
  // id: 'piece' (not a real uuid, not a real row) instead of querying the
  // real imagecare.units table - see the long comment on createUnit() in
  // masterDataService.ts for how that silently broke every product save.
  // Now real, matching useCategories()/useSuppliers() exactly.
  const ctx = useUserContext();
  return useQuery({ queryKey: ['inventory', 'units', ctx.business_id], queryFn: () => listUnits(ctx).then(unwrap) });
}

// 2026-09-01: the user has said - repeatedly, and again after the first fix
// attempt - that Units should not be a thing they ever see or manage: the
// system just runs on pieces, full stop, no dropdown, no "add a unit"
// prompt. Exposing UnitQuickSelect in the product form was the wrong fix
// for the underlying bug (unit_id: 'piece' not being a real row) - it
// solved the crash but reintroduced exactly the picker the user had
// already asked to have removed. This hook is the actual fix: it silently
// makes sure ONE real "Piece" unit row exists for the business the first
// time it's needed, with no UI at all - product forms just use it via the
// existing categoryId-style backfill effect, same as before this ever
// became visible. Guarded with a ref so it only ever fires the create once
// per mount, and becomes a no-op forever after that first row exists.
export function useEnsureDefaultUnit(): UseQueryResult<import('../../../types/inventory').UnitOfMeasure[]> {
  const unitsQuery = useUnits();
  const createUnit = useCreateUnit();
  const attempted = useRef(false);

  useEffect(() => {
    if (
      unitsQuery.isSuccess &&
      (unitsQuery.data ?? []).length === 0 &&
      !attempted.current &&
      !createUnit.isPending
    ) {
      attempted.current = true;
      createUnit.mutate({ name: 'Piece', abbreviation: 'pcs' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitsQuery.isSuccess, unitsQuery.data]);

  return unitsQuery;
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
// 2026-09-02: this used to be a bare alias to useCreateProduct, which
// expects a full ProductInput object - but both call sites
// (ProductsListPage/ProductDetailPage) call .mutateAsync(product.id), a
// bare string. Every field createProduct() read off that string came back
// undefined, so "Duplicate" silently created a blank, nameless product.
// Real fix: fetch the source product, build a fresh ProductInput from it
// (name suffixed "(Copy)"), and create that - same shape as a brand-new
// Add Product. sku/barcode are deliberately left out so a new one is
// required/generated, never copied, per the uniqueness fix on those columns.
export function useDuplicateProduct(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: UUID | string) => {
      const source = await getProduct(ctx, id as UUID).then(unwrap);
      const product = await createProduct(ctx, {
        name: `${source.name} (Copy)`,
        sku: null, barcode: null,
        description: source.description ?? null,
        category_id: source.category_id ?? null,
        unit_id: source.unit_id ?? null,
        selling_price: source.selling_price ?? 0,
        cost_price: source.cost_price ?? 0,
        reorder_level: source.reorder_level ?? 0,
        is_stockable: source.is_stockable ?? true,
        is_sellable: source.is_sellable ?? true,
        is_purchasable: source.is_purchasable ?? true,
        is_active: true,
        track_expiry: source.track_expiry ?? false,
        tax_rate: source.tax_rate ?? 0,
        metadata: { brand_id: source.metadata?.brand_id ?? null, supplier_id: source.metadata?.supplier_id ?? null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).then(unwrap);
      return product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', 'products'] });
    },
  });
}
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
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; abbreviation: string }) => createUnit(ctx, input).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'units'] }),
  });
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
export function useCreateBrand(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => createBrand(input, userId ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }),
  });
}
export function useUpdateBrand(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name: string } }) => updateBrand(id, input, userId ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }),
  });
}
export function useArchiveBrand(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveBrand(id, userId ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }),
  });
}
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
export function useMergeCategories(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      mergeCategories(ctx, sourceId as UUID, targetId as UUID).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', 'categories'] });
      qc.invalidateQueries({ queryKey: ['inventory', 'products'] });
    },
  });
}
export function useArchiveUnit(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveUnit(ctx, id as UUID).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'units'] }),
  });
}
export function useUpdateUnit(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; abbreviation?: string } }) =>
      updateUnit(ctx, id as UUID, input).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'units'] }),
  });
}

export function useCreateCategory(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) => createCategory(ctx, input).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'categories'] }),
  });
}
