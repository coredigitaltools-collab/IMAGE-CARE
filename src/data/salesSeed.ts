import type { Customer } from '../types/sales'

// No sample customers are pre-populated — a fresh install starts with
// zero, exactly like Inventory starts with zero products/categories.
// (This file previously seeded two fictional customers; that was a real
// inconsistency with the "no hardcoded placeholder data" standard the
// rest of the app follows, caught and fixed here.)
export function seedCustomers(): Customer[] {
  return []
}
