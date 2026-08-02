import { stampNew } from '../lib/audit'
import type { Brand, Category, Product, Supplier, UnitOfMeasure } from '../types/inventory'

const SEED_USER = 'system-seed'

// This app is a template, it must not assume what kind of business is
// using it. Categories, brands, suppliers, and products are therefore
// NOT pre-populated with any industry's data; every business starts
// with an empty catalogue and builds their own from Inventory → Add
// Product (which includes an inline "+ Add new category" shortcut so
// nobody is ever blocked by an empty list). See README "Rebranding this
// app for a different business" for the full picture.
export function seedCategories(): Category[] {
  return []
}

export function seedBrands(): Brand[] {
  return []
}

// Units of measure are the one exception: "Piece", "Box", etc. aren't
// specific to any industry, virtually every business that sells
// physical goods needs at least one of these to create its first
// product. Still fully editable/deletable in Settings → Units.
export function seedUnits(): UnitOfMeasure[] {
  return [
    { ...stampNew(SEED_USER), name: 'Piece', abbreviation: 'pc' },
    { ...stampNew(SEED_USER), name: 'Box', abbreviation: 'box' },
    { ...stampNew(SEED_USER), name: 'Pack', abbreviation: 'pack' },
    { ...stampNew(SEED_USER), name: 'Kilogram', abbreviation: 'kg' },
    { ...stampNew(SEED_USER), name: 'Litre', abbreviation: 'L' },
  ]
}

export function seedSuppliers(): Supplier[] {
  return []
}

export function seedProducts(
  _categories: Category[],
  _brands: Brand[],
  _units: UnitOfMeasure[],
  _suppliers: Supplier[],
): Product[] {
  return []
}
