import { stampNew } from '../lib/audit'
import type { Customer } from '../types/sales'

const SEED_USER = 'system-seed'

export function seedCustomers(): Customer[] {
  return [
    {
      ...stampNew(SEED_USER),
      name: 'Grace Nakato',
      phone: '+256 700 111222',
      email: 'grace.nakato@example.com',
      address: 'Ntinda, Kampala',
      notes: '',
      loyaltyPoints: 0,
      lifetimePurchases: 0,
      creditBalance: 0,
    },
    {
      ...stampNew(SEED_USER),
      name: 'Daniel Okello',
      phone: '+256 700 333444',
      email: '',
      address: '',
      notes: 'Prefers mobile money.',
      loyaltyPoints: 0,
      lifetimePurchases: 0,
      creditBalance: 0,
    },
  ]
}
