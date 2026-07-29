// Core domain types for ImageCare.
// Kept independent of any data source (mock or Supabase) so the UI layer
// never depends on how data is fetched — only on these shapes.

export type UserRole = 'owner' | 'manager' | 'staff'

export interface Branch {
  id: string
  name: string
}

export interface AuthedUser {
  id: string
  name: string
  role: UserRole
  /** Branches this user is permitted to view. Owners/managers may see all. */
  allowedBranchIds: string[]
}

export interface DashboardSummary {
  branchId: string | 'all'
  todaysSales: number
  todaysExpenses: number
  cashAvailable: number
  /** The currency these figures are expressed in (display/reporting currency — user-selectable). */
  currency: string
  asOf: string // ISO timestamp
}

export interface LowStockItem {
  id: string
  name: string
  quantityRemaining: number
  reorderLevel: number
  branchId: string
}

export type SaleStatus = 'completed' | 'pending' | 'refunded'

export interface RecentSale {
  id: string
  reference: string
  customerName: string
  amount: number
  currency: string
  status: SaleStatus
  createdAt: string // ISO timestamp
  branchId: string
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  lastSyncedAt: string | null // ISO timestamp
  pendingCount: number
}
