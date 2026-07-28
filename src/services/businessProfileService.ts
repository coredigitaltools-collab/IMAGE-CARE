import { getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { stampUpdated } from '../lib/audit'
import { seedBusinessProfile } from '../data/settingsSeed'
import type { BusinessProfile, BusinessProfileInput } from '../types/settings'

const KEY = 'settings:business-profile'

export async function getBusinessProfile(): Promise<BusinessProfile> {
  return getSingleton(KEY, seedBusinessProfile)
}

export async function saveBusinessProfile(input: BusinessProfileInput, userId: string): Promise<BusinessProfile> {
  const current = await getBusinessProfile()
  const updated: BusinessProfile = stampUpdated({ ...current, ...input }, userId)
  await setSingleton(KEY, updated)
  await enqueueSync({ entityType: 'business_profile', entityId: updated.id, operation: 'update' })
  return updated
}
