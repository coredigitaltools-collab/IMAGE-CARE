import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { seedCustomers } from '../data/salesSeed'
import type { Customer, CustomerInput, CustomerNote } from '../types/sales'

const KEY = 'sales:customers'

export async function listCustomers(): Promise<Customer[]> {
  return getCollection(KEY, seedCustomers)
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const customers = await listCustomers()
  return customers.find((c) => c.id === id) ?? null
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '')
}

/** IMP-004 business rule: "Detect duplicates" — this is informational,
 *  not a hard block (unlike SKU/barcode uniqueness), since two real
 *  customers can legitimately share incomplete contact info. The
 *  checkout flow surfaces these as a warning the cashier can act on or
 *  dismiss. */
export async function findPossibleDuplicates(input: Pick<CustomerInput, 'name' | 'phone' | 'email'>): Promise<Customer[]> {
  const customers = await listCustomers()
  const phone = input.phone ? normalizePhone(input.phone) : null
  const email = input.email ? input.email.trim().toLowerCase() : null
  const name = input.name.trim().toLowerCase()

  return customers.filter((c) => {
    if (phone && c.phone && normalizePhone(c.phone) === phone) return true
    if (email && c.email && c.email.trim().toLowerCase() === email) return true
    if (name && c.name.trim().toLowerCase() === name) return true
    return false
  })
}

export async function createCustomer(input: CustomerInput, userId: string): Promise<Customer> {
  const customers = await listCustomers()
  const customer: Customer = {
    ...stampNew(userId),
    ...input,
    loyaltyPoints: 0,
    lifetimePurchases: 0,
    creditBalance: 0,
  }
  await setCollection(KEY, [...customers, customer])
  await enqueueSync({ entityType: 'customer', entityId: customer.id, operation: 'create' })
  return customer
}

export async function updateCustomer(id: string, input: CustomerInput, userId: string): Promise<Customer> {
  const customers = await listCustomers()
  let updated: Customer | null = null
  const next = customers.map((c) => {
    if (c.id !== id) return c
    updated = stampUpdated({ ...c, ...input }, userId)
    return updated
  })
  if (!updated) throw new Error('Customer not found')
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'customer', entityId: id, operation: 'update' })
  return updated
}

export async function archiveCustomer(id: string, userId: string): Promise<void> {
  const customers = await listCustomers()
  const next = customers.map((c) => (c.id === id ? stampUpdated({ ...c, is_active: false }, userId) : c))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'customer', entityId: id, operation: 'disable' })
}

export async function reactivateCustomer(id: string, userId: string): Promise<void> {
  const customers = await listCustomers()
  const next = customers.map((c) => (c.id === id ? stampUpdated({ ...c, is_active: true }, userId) : c))
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'customer', entityId: id, operation: 'update' })
}

// ---------- Merge (IMP-005 refinement) ----------
// Orchestrated from the hook layer (useMergeCustomers), not from inside
// this file — merging also needs to reassign Sales, and salesService
// already imports this file (for recordCustomerPurchase), so this file
// importing salesService back would create a circular dependency. This
// function handles only the customer-record side: combine the numbers,
// union the tags, and archive the duplicate. Sales and Notes reassignment
// happen via their own dedicated functions, called alongside this one.

export async function applyCustomerMerge(sourceId: string, targetId: string, userId: string): Promise<Customer> {
  const customers = await listCustomers()
  const source = customers.find((c) => c.id === sourceId)
  const target = customers.find((c) => c.id === targetId)
  if (!source || !target) throw new Error('Customer not found')

  const mergedTarget = stampUpdated(
    {
      ...target,
      tags: [...new Set([...target.tags, ...source.tags])],
      loyaltyPoints: target.loyaltyPoints + source.loyaltyPoints,
      lifetimePurchases: target.lifetimePurchases + source.lifetimePurchases,
      creditBalance: target.creditBalance + source.creditBalance,
      notes: [target.notes, source.notes].filter(Boolean).join(' · '),
    },
    userId,
  )

  const next = customers.map((c) => {
    if (c.id === targetId) return mergedTarget
    if (c.id === sourceId) return stampUpdated({ ...c, is_active: false }, userId)
    return c
  })
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'customer', entityId: targetId, operation: 'update' })
  await enqueueSync({ entityType: 'customer', entityId: sourceId, operation: 'disable' })
  return mergedTarget
}

export async function reassignCustomerNotes(sourceId: string, targetId: string): Promise<void> {
  const notes = await getCollection<CustomerNote>(NOTES_KEY, () => [])
  const next = notes.map((n) => (n.customerId === sourceId ? { ...n, customerId: targetId } : n))
  await setCollection(NOTES_KEY, next)
}

/** Called by salesService when a sale completes for a registered
 *  (non-walk-in) customer — updates lifetime spend, loyalty points, and
 *  (for credit sales) the outstanding balance. This is the one place
 *  those fields ever change, so every module reading Customer sees
 *  consistent numbers (IMP-004: "Reuse one customer profile across all
 *  modules"). */
export async function recordCustomerPurchase(
  customerId: string,
  amount: number,
  loyaltyPointsEarned: number,
  isCredit: boolean,
  userId: string,
): Promise<void> {
  const customers = await listCustomers()
  const next = customers.map((c) => {
    if (c.id !== customerId) return c
    return stampUpdated(
      {
        ...c,
        lifetimePurchases: c.lifetimePurchases + amount,
        loyaltyPoints: c.loyaltyPoints + loyaltyPointsEarned,
        creditBalance: isCredit ? c.creditBalance + amount : c.creditBalance,
      },
      userId,
    )
  })
  await setCollection(KEY, next)
  await enqueueSync({ entityType: 'customer', entityId: customerId, operation: 'update' })
}

// ---------- Notes log (Customer Profile "Notes" tab) ----------
// Separate from Customer.notes (a single free-text field on the quick
// form) — this is a real, dated, attributed history: "what have we
// discussed with this customer, and when." Answers a concrete question
// a staff member would actually ask before calling a customer back.

const NOTES_KEY = 'sales:customer-notes'

export async function listCustomerNotes(customerId: string): Promise<CustomerNote[]> {
  const notes = await getCollection<CustomerNote>(NOTES_KEY, () => [])
  return notes
    .filter((n) => n.customerId === customerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function addCustomerNote(customerId: string, text: string, userId: string): Promise<CustomerNote> {
  const notes = await getCollection<CustomerNote>(NOTES_KEY, () => [])
  const note: CustomerNote = {
    id: crypto.randomUUID(),
    customerId,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  await setCollection(NOTES_KEY, [...notes, note])
  await enqueueSync({ entityType: 'customer_note', entityId: note.id, operation: 'create' })
  return note
}

// ---------- CRM Dashboard KPIs ----------
// Each number here answers one specific question an owner would ask —
// nothing decorative. "Active" is defined as "purchased in the last 30
// days" since that's the window that actually distinguishes an engaged
// customer from a one-time visitor for a small business.

export interface CrmKpis {
  totalCustomers: number
  newCustomers30d: number
  activeCustomers30d: number
  lifetimeValueUgx: number
  outstandingCreditUgx: number
  loyaltyMembers: number
}

export async function getCrmKpis(recentCustomerIds30d: Set<string>): Promise<CrmKpis> {
  const customers = (await listCustomers()).filter((c) => c.is_active)
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  return {
    totalCustomers: customers.length,
    newCustomers30d: customers.filter((c) => new Date(c.created_at).getTime() >= thirtyDaysAgo).length,
    activeCustomers30d: customers.filter((c) => recentCustomerIds30d.has(c.id)).length,
    lifetimeValueUgx: customers.reduce((sum, c) => sum + c.lifetimePurchases, 0),
    outstandingCreditUgx: customers.reduce((sum, c) => sum + c.creditBalance, 0),
    loyaltyMembers: customers.filter((c) => c.loyaltyPoints > 0).length,
  }
}
