import { stampNew } from '../lib/audit'
import type {
  AppearanceSettings,
  BranchRecord,
  BusinessProfile,
  InventorySettingsConfig,
  NotificationSettings,
  PermissionMatrix,
  ReceiptSettings,
  SalesSettingsConfig,
  StaffMember,
  TaxRate,
} from '../types/settings'

const SEED_USER = 'system-seed'

export function seedBusinessProfile(): BusinessProfile {
  // First-run default only — shown until someone edits it via Settings →
  // Business Profile, which is how this actually gets renamed day to day.
  return {
    ...stampNew(SEED_USER),
    businessName: 'ImageCare',
    contactEmail: 'hello@imagecare.co.ug',
    contactPhone: '+256 700 000000',
    address: 'Kampala, Uganda',
    defaultCurrency: 'UGX',
  }
}

export function seedBranches(): BranchRecord[] {
  return [
    { ...stampNew(SEED_USER), name: 'Kampala Main', code: 'KLA-01', address: 'Kampala Road', phone: '+256 700 111111' },
    { ...stampNew(SEED_USER), name: 'Ntinda', code: 'NTD-01', address: 'Ntinda Trading Centre', phone: '+256 700 222222' },
    { ...stampNew(SEED_USER), name: 'Industrial Area', code: 'IND-01', address: 'Industrial Area', phone: '+256 700 333333' },
  ]
}

export function seedStaff(branches: BranchRecord[]): StaffMember[] {
  const allBranchIds = branches.map((b) => b.id)
  return [
    {
      ...stampNew(SEED_USER),
      fullName: 'Owner',
      username: 'owner',
      email: 'owner@imagecare.co.ug',
      role: 'owner',
      branchIds: allBranchIds,
    },
  ]
}

export function seedPermissionMatrix(): PermissionMatrix {
  const allTrue = {
    view_dashboard: true,
    manage_inventory: true,
    manage_sales: true,
    manage_purchases: true,
    manage_expenses: true,
    manage_payroll: true,
    manage_clients: true,
    manage_staff: true,
    manage_settings: true,
    view_reports: true,
  } as const

  return {
    owner: { ...allTrue },
    manager: {
      view_dashboard: true,
      manage_inventory: true,
      manage_sales: true,
      manage_purchases: true,
      manage_expenses: true,
      manage_payroll: false,
      manage_clients: true,
      manage_staff: false,
      manage_settings: false,
      view_reports: true,
    },
    cashier: {
      view_dashboard: true,
      manage_inventory: false,
      manage_sales: true,
      manage_purchases: false,
      manage_expenses: false,
      manage_payroll: false,
      manage_clients: true,
      manage_staff: false,
      manage_settings: false,
      view_reports: false,
    },
    accountant: {
      view_dashboard: true,
      manage_inventory: false,
      manage_sales: false,
      manage_purchases: false,
      manage_expenses: true,
      manage_payroll: true,
      manage_clients: false,
      manage_staff: false,
      manage_settings: false,
      view_reports: true,
    },
  }
}

export function seedTaxRates(): TaxRate[] {
  return [{ ...stampNew(SEED_USER), name: 'VAT', ratePercent: 18, isInclusive: true, isDefault: true }]
}

export function seedReceiptSettings(): ReceiptSettings {
  return {
    ...stampNew(SEED_USER),
    footerMessage: 'Thank you for your business!',
    showLogo: true,
    showTaxBreakdown: true,
    showCashierName: true,
  }
}

export function seedInventorySettings(): InventorySettingsConfig {
  return {
    ...stampNew(SEED_USER),
    defaultReorderLevel: 10,
    skuPrefix: 'SKU',
    trackExpiryDates: false,
  }
}

export function seedSalesSettings(): SalesSettingsConfig {
  return {
    ...stampNew(SEED_USER),
    allowDiscounts: true,
    maxDiscountPercent: 15,
    requireCustomerForCredit: true,
  }
}

export function seedNotificationSettings(): NotificationSettings {
  return {
    ...stampNew(SEED_USER),
    lowStockAlerts: true,
    dailySummaryEmail: false,
    notificationEmail: 'owner@imagecare.co.ug',
  }
}

export function seedAppearanceSettings(): AppearanceSettings {
  return {
    ...stampNew(SEED_USER),
    density: 'comfortable',
    dateFormat: 'DD/MM/YYYY',
  }
}
