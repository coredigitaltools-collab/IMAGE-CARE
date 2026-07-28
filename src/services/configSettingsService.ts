import { getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { stampUpdated } from '../lib/audit'
import {
  seedAppearanceSettings,
  seedInventorySettings,
  seedNotificationSettings,
  seedReceiptSettings,
  seedSalesSettings,
} from '../data/settingsSeed'
import type {
  AppearanceSettings,
  InventorySettingsConfig,
  NotificationSettings,
  ReceiptSettings,
  SalesSettingsConfig,
} from '../types/settings'

const RECEIPT_KEY = 'settings:receipts'
const INVENTORY_KEY = 'settings:inventory-config'
const SALES_KEY = 'settings:sales-config'
const NOTIFICATIONS_KEY = 'settings:notifications'
const APPEARANCE_KEY = 'settings:appearance'

export async function getReceiptSettings(): Promise<ReceiptSettings> {
  return getSingleton(RECEIPT_KEY, seedReceiptSettings)
}
export async function saveReceiptSettings(
  input: Omit<ReceiptSettings, keyof import('../lib/audit').AuditFields>,
  userId: string,
): Promise<ReceiptSettings> {
  const current = await getReceiptSettings()
  const updated = stampUpdated({ ...current, ...input }, userId)
  await setSingleton(RECEIPT_KEY, updated)
  await enqueueSync({ entityType: 'receipt_settings', entityId: updated.id, operation: 'update' })
  return updated
}

export async function getInventorySettings(): Promise<InventorySettingsConfig> {
  return getSingleton(INVENTORY_KEY, seedInventorySettings)
}
export async function saveInventorySettings(
  input: Omit<InventorySettingsConfig, keyof import('../lib/audit').AuditFields>,
  userId: string,
): Promise<InventorySettingsConfig> {
  const current = await getInventorySettings()
  const updated = stampUpdated({ ...current, ...input }, userId)
  await setSingleton(INVENTORY_KEY, updated)
  await enqueueSync({ entityType: 'inventory_settings', entityId: updated.id, operation: 'update' })
  return updated
}

export async function getSalesSettings(): Promise<SalesSettingsConfig> {
  return getSingleton(SALES_KEY, seedSalesSettings)
}
export async function saveSalesSettings(
  input: Omit<SalesSettingsConfig, keyof import('../lib/audit').AuditFields>,
  userId: string,
): Promise<SalesSettingsConfig> {
  const current = await getSalesSettings()
  const updated = stampUpdated({ ...current, ...input }, userId)
  await setSingleton(SALES_KEY, updated)
  await enqueueSync({ entityType: 'sales_settings', entityId: updated.id, operation: 'update' })
  return updated
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return getSingleton(NOTIFICATIONS_KEY, seedNotificationSettings)
}
export async function saveNotificationSettings(
  input: Omit<NotificationSettings, keyof import('../lib/audit').AuditFields>,
  userId: string,
): Promise<NotificationSettings> {
  const current = await getNotificationSettings()
  const updated = stampUpdated({ ...current, ...input }, userId)
  await setSingleton(NOTIFICATIONS_KEY, updated)
  await enqueueSync({ entityType: 'notification_settings', entityId: updated.id, operation: 'update' })
  return updated
}

export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  return getSingleton(APPEARANCE_KEY, seedAppearanceSettings)
}
export async function saveAppearanceSettings(
  input: Omit<AppearanceSettings, keyof import('../lib/audit').AuditFields>,
  userId: string,
): Promise<AppearanceSettings> {
  const current = await getAppearanceSettings()
  const updated = stampUpdated({ ...current, ...input }, userId)
  await setSingleton(APPEARANCE_KEY, updated)
  await enqueueSync({ entityType: 'appearance_settings', entityId: updated.id, operation: 'update' })
  return updated
}
