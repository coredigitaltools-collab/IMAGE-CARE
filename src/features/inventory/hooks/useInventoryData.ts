import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as categoryService from '../../../services/categoryService'
import * as brandService from '../../../services/brandService'
import * as unitService from '../../../services/unitService'
import * as supplierService from '../../../services/supplierService'
import * as productService from '../../../services/productService'
import * as stockService from '../../../services/stockService'
import { getInventoryKpis, getProductStatistics } from '../../../services/inventoryDashboardService'
import * as reports from '../../../services/inventoryReportsService'
import type { SupportedCurrency } from '../../../lib/currency'
import type {
  BrandInput,
  CategoryInput,
  ProductInput,
  StockAdjustmentInput,
  SupplierInput,
  UnitInput,
} from '../../../types/inventory'

const invalidateInventory = (queryClient: ReturnType<typeof useQueryClient>, keys: string[]) =>
  keys.forEach((k) => queryClient.invalidateQueries({ queryKey: ['inventory', k] }))

// ---------- Dashboard ----------

export function useInventoryKpis(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['inventory', 'kpis', currency], queryFn: () => getInventoryKpis(currency) })
}

export function useProductStatistics() {
  return useQuery({ queryKey: ['inventory', 'product-stats'], queryFn: getProductStatistics })
}

export function useInventoryValueTrend(range: reports.TrendRange, currency: SupportedCurrency) {
  return useQuery({
    queryKey: ['inventory', 'value-trend', range, currency],
    queryFn: () => reports.getInventoryValueTrend(range, currency),
  })
}

// ---------- Categories ----------

export function useCategories() {
  return useQuery({ queryKey: ['inventory', 'categories'], queryFn: categoryService.listCategories })
}
export function useCreateCategory(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CategoryInput) => categoryService.createCategory(input, userId),
    onSuccess: () => invalidateInventory(qc, ['categories']),
  })
}
export function useUpdateCategory(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryInput }) => categoryService.updateCategory(id, input, userId),
    onSuccess: () => invalidateInventory(qc, ['categories']),
  })
}
export function useArchiveCategory(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => categoryService.archiveCategory(id, userId),
    onSuccess: () => invalidateInventory(qc, ['categories']),
  })
}
export function useMergeCategories(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      categoryService.mergeCategories(sourceId, targetId, userId),
    onSuccess: () => invalidateInventory(qc, ['categories', 'products']),
  })
}

// ---------- Brands ----------

export function useBrands() {
  return useQuery({ queryKey: ['inventory', 'brands'], queryFn: brandService.listBrands })
}
export function useCreateBrand(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BrandInput) => brandService.createBrand(input, userId),
    onSuccess: () => invalidateInventory(qc, ['brands']),
  })
}
export function useUpdateBrand(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BrandInput }) => brandService.updateBrand(id, input, userId),
    onSuccess: () => invalidateInventory(qc, ['brands']),
  })
}
export function useArchiveBrand(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => brandService.archiveBrand(id, userId),
    onSuccess: () => invalidateInventory(qc, ['brands']),
  })
}

// ---------- Units ----------

export function useUnits() {
  return useQuery({ queryKey: ['inventory', 'units'], queryFn: unitService.listUnits })
}
export function useCreateUnit(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UnitInput) => unitService.createUnit(input, userId),
    onSuccess: () => invalidateInventory(qc, ['units']),
  })
}
export function useUpdateUnit(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UnitInput }) => unitService.updateUnit(id, input, userId),
    onSuccess: () => invalidateInventory(qc, ['units']),
  })
}
export function useArchiveUnit(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unitService.archiveUnit(id, userId),
    onSuccess: () => invalidateInventory(qc, ['units']),
  })
}

// ---------- Suppliers ----------

export function useSuppliers() {
  return useQuery({ queryKey: ['inventory', 'suppliers'], queryFn: supplierService.listSuppliers })
}
export function useCreateSupplier(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SupplierInput) => supplierService.createSupplier(input, userId),
    onSuccess: () => invalidateInventory(qc, ['suppliers']),
  })
}
export function useUpdateSupplier(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupplierInput }) => supplierService.updateSupplier(id, input, userId),
    onSuccess: () => invalidateInventory(qc, ['suppliers']),
  })
}
export function useArchiveSupplier(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supplierService.archiveSupplier(id, userId),
    onSuccess: () => invalidateInventory(qc, ['suppliers']),
  })
}

// ---------- Products ----------

export function useProducts() {
  return useQuery({ queryKey: ['inventory', 'products'], queryFn: productService.listProducts })
}
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['inventory', 'product', id],
    queryFn: () => productService.getProduct(id as string),
    enabled: Boolean(id),
  })
}
export function useGeneratedSku() {
  return useQuery({ queryKey: ['inventory', 'next-sku'], queryFn: productService.generateSku, staleTime: 0 })
}
export function useCreateProduct(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProductInput) => productService.createProduct(input, userId),
    onSuccess: () => invalidateInventory(qc, ['products', 'product', 'kpis', 'movements']),
  })
}
export function useUpdateProduct(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductInput }) => productService.updateProduct(id, input, userId),
    onSuccess: () => invalidateInventory(qc, ['products', 'product', 'kpis']),
  })
}
export function useArchiveProduct(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productService.archiveProduct(id, userId),
    onSuccess: () => invalidateInventory(qc, ['products', 'product', 'kpis']),
  })
}
export function useReactivateProduct(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productService.reactivateProduct(id, userId),
    onSuccess: () => invalidateInventory(qc, ['products', 'product', 'kpis']),
  })
}
export function useDuplicateProduct(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productService.duplicateProduct(id, userId),
    onSuccess: () => invalidateInventory(qc, ['products', 'product', 'kpis']),
  })
}

// ---------- Stock movements & adjustments ----------

export function useStockMovements(productId?: string) {
  return useQuery({ queryKey: ['inventory', 'movements', productId ?? 'all'], queryFn: () => stockService.listMovements(productId) })
}
export function useStockAdjustments() {
  return useQuery({ queryKey: ['inventory', 'adjustments'], queryFn: stockService.listAdjustments })
}
export function useCreateAdjustment(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StockAdjustmentInput) => stockService.createAdjustment(input, userId),
    onSuccess: () => invalidateInventory(qc, ['products', 'product', 'movements', 'adjustments', 'kpis']),
  })
}

// ---------- Reports ----------

export function useValuationReport(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['inventory', 'report-valuation', currency], queryFn: () => reports.getValuationReport(currency) })
}
export function useStockLevelsReport() {
  return useQuery({ queryKey: ['inventory', 'report-stock-levels'], queryFn: reports.getStockLevelsReport })
}
export function useLowStockReport() {
  return useQuery({ queryKey: ['inventory', 'report-low-stock'], queryFn: reports.getLowStockReport })
}
export function useOutOfStockReport() {
  return useQuery({ queryKey: ['inventory', 'report-out-of-stock'], queryFn: reports.getOutOfStockReport })
}
export function useDeadStockReport() {
  return useQuery({ queryKey: ['inventory', 'report-dead-stock'], queryFn: () => reports.getDeadStockReport() })
}
export function useFastSlowMovingReport() {
  return useQuery({ queryKey: ['inventory', 'report-fast-slow'], queryFn: () => reports.getFastSlowMovingReport() })
}
export function useProfitabilityReport(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['inventory', 'report-profitability', currency], queryFn: () => reports.getProfitabilityReport(currency) })
}
