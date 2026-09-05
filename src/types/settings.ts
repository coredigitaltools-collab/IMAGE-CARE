import type { AuditFields } from '../lib/audit'

// ---------- People & Access ----------

// Roles are a business-defined catalogue, not a fixed list, a real
// organization has far more positions than "Owner/Manager/Cashier/
// Accountant" (social media, warehouse, delivery, whatever the business
// actually runs). Owner is the one protected exception: it always has
// unrestricted access and can't be renamed, deleted, or have its
// permissions edited (IMP-002 business rule). Every other role is just
// a RoleDefinition someone added, the same way product categories or
// expense categories are added, never a hardcoded set.
export const OWNER_ROLE_ID = 'owner'

export type StaffRole = string

export interface RoleDefinition extends AuditFields {
  name: string
}
export type RoleDefinitionInput = Pick<RoleDefinition, 'name'>

export interface StaffMember extends AuditFields {
  fullName: string
  username: string
  email: string
  role: StaffRole
  branchIds: string[]
  // Real column from imagecare.users (mapStaffRow spreads the raw row in,
  // this just gives it a declared type). Authoritative owner signal - see
  // hooks/usePermission.ts. Used as a display fallback in PeopleAccessPage
  // so the Owner's role label can never regress to "Unknown role" again,
  // even if the `role` text value ever drifts from the role catalogue's id.
  is_owner?: boolean
  // PIN-only staff fields (2026-09-05 - see fn_set_staff_pin/fn_verify_staff_pin).
  // A staff member added this way has no email/login account at all -
  // jobTitle/phone/monthlySalary are optional display info, and hasPin
  // reflects whether a PIN has ever been set (pin_set_at IS NOT NULL) -
  // never the PIN or its hash, which the API never returns.
  jobTitle?: string
  phone?: string
  monthlySalary?: number
  hasPin?: boolean
}

export type StaffInput = Pick<StaffMember, 'fullName' | 'role' | 'branchIds'> & {
  // Optional/PIN-only staff creation fields. username/email are kept out
  // of StaffInput entirely now - PIN-only staff have neither.
  jobTitle?: string
  phone?: string
  monthlySalary?: number
  // Required when creating a new staff member (StaffFormModal enforces
  // this); ignored on edit, where the PIN is changed via "Reset PIN" instead.
  pin?: string
}

// Permission Matrix, Owners are always fully permitted (IMP-002 business
// rule: "Only Owners have unrestricted access") and that row is not
// editable. Other roles are configurable.
export type Permission =
  | 'view_dashboard'
  | 'manage_inventory'
  | 'manage_sales'
  | 'manage_purchases'
  | 'manage_expenses'
  | 'manage_payroll'
  | 'manage_clients'
  | 'manage_credit'
  | 'manage_invoices'
  | 'manage_staff'
  | 'manage_settings'
  | 'view_reports'

export const PERMISSIONS: Permission[] = [
  'view_dashboard',
  'manage_inventory',
  'manage_sales',
  'manage_purchases',
  'manage_expenses',
  'manage_payroll',
  'manage_clients',
  'manage_credit',
  'manage_invoices',
  'manage_staff',
  'manage_settings',
  'view_reports',
]

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_dashboard: 'View Dashboard',
  manage_inventory: 'Manage Inventory',
  manage_sales: 'Manage Sales',
  manage_purchases: 'Manage Purchases',
  manage_expenses: 'Manage Expenses',
  manage_payroll: 'Manage Payroll',
  manage_clients: 'Manage Clients',
  manage_credit: 'Manage Credit',
  manage_invoices: 'Manage Invoices',
  manage_staff: 'Manage Staff',
  manage_settings: 'Manage Settings',
  view_reports: 'View Reports',
}

export type PermissionMatrix = Record<string, Record<Permission, boolean>>

// ---------- Business Profile ----------

export interface BusinessProfile extends AuditFields {
  businessName: string
  contactEmail: string
  contactPhone: string
  address: string
  defaultCurrency: string
}

export type BusinessProfileInput = Pick<
  BusinessProfile,
  'businessName' | 'contactEmail' | 'contactPhone' | 'address' | 'defaultCurrency'
>

// ---------- Branch Management ----------

export interface BranchRecord extends AuditFields {
  name: string
  code: string
  address: string
  phone: string
}

export type BranchInput = Pick<BranchRecord, 'name' | 'code' | 'address' | 'phone'>

// ---------- Tax Settings ----------

export interface TaxRate extends AuditFields {
  name: string
  ratePercent: number
  isInclusive: boolean
  isDefault: boolean
}

export type TaxRateInput = Pick<TaxRate, 'name' | 'ratePercent' | 'isInclusive' | 'isDefault'>

// ---------- Receipt Settings (singleton) ----------

export interface ReceiptSettings extends AuditFields {
  footerMessage: string
  showLogo: boolean
  showTaxBreakdown: boolean
  showCashierName: boolean
}

// ---------- Inventory Settings (singleton) ----------

export interface InventorySettingsConfig extends AuditFields {
  defaultReorderLevel: number
  skuPrefix: string
  trackExpiryDates: boolean
}

// ---------- Sales Settings (singleton) ----------

export interface SalesSettingsConfig extends AuditFields {
  allowDiscounts: boolean
  maxDiscountPercent: number
  requireCustomerForCredit: boolean
}

// ---------- Notification Settings (singleton) ----------

export interface NotificationSettings extends AuditFields {
  lowStockAlerts: boolean
  dailySummaryEmail: boolean
  notificationEmail: string
}

// ---------- Appearance Settings (singleton) ----------

export interface AppearanceSettings extends AuditFields {
  density: 'comfortable' | 'compact'
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY'
}

// ---------- Backup & Synchronization ----------

export interface BackupRecord {
  id: string
  createdAt: string
  createdBy: string
  sizeBytes: number
}

export interface SyncQueueItem {
  id: string
  entityType: string
  entityId: string
  operation: 'create' | 'update' | 'disable'
  createdAt: string
}
