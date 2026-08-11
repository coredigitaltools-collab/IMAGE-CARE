// ============================================================
// IMC-BLD-004 | ImageCare ERP Frontend Integration v1.0
// File: src/hooks/modules/useDashboard.ts
// Purpose: Hook for IMC-SRS-001 Dashboard.
//          Loads all KPIs from the shared Reporting Service.
//          Dashboard never calculates financial truth independently.
// ============================================================

import { useCallback, useState } from 'react';
import { useUserContext, useActiveBranch } from '../../context/AppContext';
import { getDashboardKPIs } from '../../services/reporting/reportingService';
import { getStockSummary } from '../../services/reporting/reportingService';
import { useAsyncData } from '../shared/useServiceCall';
import type { DashboardKPIs } from '../../types/database';
import type { StockSummaryRow } from '../../types/database';
import { startOfMonth, endOfDay } from '../../utils/formatters';

export function useDashboard(branchOverride?: string) {
  const ctx      = useUserContext();
  const branch   = useActiveBranch();
  const branchId = branchOverride ?? branch ?? undefined;

  const from = startOfMonth();
  const to   = endOfDay();

  // KPIs from shared reporting engine
  const kpis = useAsyncData(
    getDashboardKPIs,
    [ctx, branchId, { from, to }],
    [ctx.business_id, branchId, from]
  );

  // Low stock alerts
  const stock = useAsyncData(
    getStockSummary,
    [ctx, branchId],
    [ctx.business_id, branchId]
  );

  const lowStockItems = (stock.data ?? []).filter(
    (s: StockSummaryRow) => s.stock_status === 'low_stock' || s.stock_status === 'out_of_stock'
  );

  return {
    kpis:          kpis.data as DashboardKPIs | null,
    isLoadingKPIs: kpis.isLoading,
    kpisError:     kpis.error,
    lowStockItems,
    isLoadingStock: stock.isLoading,
    refetchAll:    () => { kpis.refetch(); stock.refetch(); },
  };
}
