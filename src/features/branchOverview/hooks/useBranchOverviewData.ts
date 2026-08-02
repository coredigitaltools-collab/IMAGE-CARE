import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as branchOverviewService from '../../../services/branchOverviewService'
import { useAuth } from '../../../hooks/useAuth'
import { useBranches } from '../../../features/settings/hooks/useSettingsData'
import type { SupportedCurrency } from '../../../lib/currency'

/** The same permission logic the main Dashboard and Inventory Dashboard
 *  use: Owners see every active branch (IMP-002, unrestricted access);
 *  anyone else is limited to their allowedBranchIds. */
export function useVisibleBranches() {
  const { user } = useAuth()
  const branchesQuery = useBranches()
  const visibleBranches = useMemo(() => {
    const active = (branchesQuery.data ?? []).filter((b) => b.is_active)
    if (user.role === 'owner') return active
    return active.filter((b) => user.allowedBranchIds.includes(b.id))
  }, [branchesQuery.data, user.role, user.allowedBranchIds])
  return { visibleBranches, isLoading: branchesQuery.isLoading }
}

export function useBranchOverview() {
  const { visibleBranches, isLoading: branchesLoading } = useVisibleBranches()
  const query = useQuery({
    queryKey: ['branch-overview', 'rows', visibleBranches.map((b) => b.id).join(',')],
    queryFn: () => branchOverviewService.getBranchOverview(visibleBranches),
    enabled: !branchesLoading,
  })
  return { ...query, isLoading: branchesLoading || query.isLoading }
}

export function useBranchOverviewDashboardKpis(currency: SupportedCurrency) {
  const { visibleBranches, isLoading: branchesLoading } = useVisibleBranches()
  const query = useQuery({
    queryKey: ['branch-overview', 'kpis', currency, visibleBranches.map((b) => b.id).join(',')],
    queryFn: () => branchOverviewService.getBranchOverviewDashboardKpis(visibleBranches, currency),
    enabled: !branchesLoading,
  })
  return { ...query, isLoading: branchesLoading || query.isLoading }
}
