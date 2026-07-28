import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedTaxRates } from '../data/settingsSeed'
import type { TaxRate, TaxRateInput } from '../types/settings'

const KEY = 'settings:tax-rates'

export async function listTaxRates(): Promise<TaxRate[]> {
  return getCollection(KEY, seedTaxRates)
}

export async function createTaxRate(input: TaxRateInput, userId: string): Promise<TaxRate> {
  const rates = await listTaxRates()
  const rate: TaxRate = { ...stampNew(userId), ...input }
  const next = input.isDefault ? rates.map((r) => ({ ...r, isDefault: false })).concat(rate) : [...rates, rate]
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'tax_rate', entityId: rate.id, operation: 'create' })
  return rate
}

export async function updateTaxRate(id: string, input: TaxRateInput, userId: string): Promise<TaxRate> {
  const rates = await listTaxRates()
  let updated: TaxRate | null = null
  const next = rates.map((r) => {
    if (r.id === id) {
      updated = stampUpdated({ ...r, ...input }, userId)
      return updated
    }
    // Only one default tax rate at a time.
    return input.isDefault ? { ...r, isDefault: false } : r
  })
  if (!updated) throw new Error('Tax rate not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'tax_rate', entityId: id, operation: 'update' })
  return updated
}
