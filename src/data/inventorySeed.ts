import { stampNew } from '../lib/audit'
import type { Brand, Category, Product, Supplier, UnitOfMeasure } from '../types/inventory'

const SEED_USER = 'system-seed'
const MAIN_BRANCH = 'branch-main'

export function seedCategories(): Category[] {
  return [
    { ...stampNew(SEED_USER), name: 'Photo Paper' },
    { ...stampNew(SEED_USER), name: 'Printer Consumables' },
    { ...stampNew(SEED_USER), name: 'Frames & Albums' },
    { ...stampNew(SEED_USER), name: 'Studio Supplies' },
  ]
}

export function seedBrands(): Brand[] {
  return [
    { ...stampNew(SEED_USER), name: 'Canon' },
    { ...stampNew(SEED_USER), name: 'HP' },
    { ...stampNew(SEED_USER), name: 'Generic' },
  ]
}

export function seedUnits(): UnitOfMeasure[] {
  return [
    { ...stampNew(SEED_USER), name: 'Piece', abbreviation: 'pc' },
    { ...stampNew(SEED_USER), name: 'Roll', abbreviation: 'roll' },
    { ...stampNew(SEED_USER), name: 'Box', abbreviation: 'box' },
    { ...stampNew(SEED_USER), name: 'Pack', abbreviation: 'pack' },
  ]
}

export function seedSuppliers(): Supplier[] {
  return [
    {
      ...stampNew(SEED_USER),
      name: 'Kampala Print Supplies Ltd',
      contactName: 'Moses Kaggwa',
      phone: '+256 700 444444',
      email: 'sales@kampalaprint.co.ug',
      tin: '1000234567',
      address: 'Nakivubo Road, Kampala',
      notes: '',
      status: 'active',
    },
    {
      ...stampNew(SEED_USER),
      name: 'Elgon Imaging Co.',
      contactName: 'Rebecca Achen',
      phone: '+256 700 555555',
      email: 'info@elgonimaging.co.ug',
      tin: '1000876543',
      address: 'Mbale Road',
      notes: 'Preferred supplier for frames and albums',
      status: 'active',
    },
  ]
}

export function seedProducts(categories: Category[], brands: Brand[], units: UnitOfMeasure[], suppliers: Supplier[]): Product[] {
  const cat = (name: string) => categories.find((c) => c.name === name)?.id ?? categories[0].id
  const brand = (name: string) => brands.find((b) => b.name === name)?.id ?? null
  const unit = (name: string) => units.find((u) => u.name === name)?.id ?? units[0].id
  const supplier = (name: string) => suppliers.find((s) => s.name.includes(name))?.id ?? null

  const items: Array<Omit<Product, keyof ReturnType<typeof stampNew> | 'imageDataUrl'>> = [
    {
      name: 'A4 Photo Paper (Glossy, 230gsm)',
      sku: 'SKU-1001',
      barcode: '6009876543210',
      categoryId: cat('Photo Paper'),
      brandId: brand('Generic'),
      unitId: unit('Roll'),
      supplierId: supplier('Kampala Print'),
      description: 'Premium glossy photo paper, 230gsm, A4 size.',
      notes: '',
      buyingPrice: 45000,
      sellingPrice: 65000,
      taxRateId: null,
      reorderLevel: 20,
      openingStock: 30,
      currentStock: 6,
      status: 'active',
    },
    {
      name: 'Canon 045 Toner Cartridge',
      sku: 'SKU-1002',
      barcode: '6009876543227',
      categoryId: cat('Printer Consumables'),
      brandId: brand('Canon'),
      unitId: unit('Piece'),
      supplierId: supplier('Kampala Print'),
      description: 'Genuine Canon 045 toner cartridge, black.',
      notes: '',
      buyingPrice: 180000,
      sellingPrice: 240000,
      taxRateId: null,
      reorderLevel: 10,
      openingStock: 15,
      currentStock: 2,
      status: 'active',
    },
    {
      name: 'Passport Photo Backdrop Roll',
      sku: 'SKU-1003',
      barcode: '6009876543234',
      categoryId: cat('Studio Supplies'),
      brandId: brand('Generic'),
      unitId: unit('Roll'),
      supplierId: null,
      description: 'Blue backdrop roll for passport photography.',
      notes: '',
      buyingPrice: 60000,
      sellingPrice: 90000,
      taxRateId: null,
      reorderLevel: 5,
      openingStock: 6,
      currentStock: 1,
      status: 'active',
    },
    {
      name: 'A5 Photo Album (200 pockets)',
      sku: 'SKU-1004',
      barcode: '6009876543241',
      categoryId: cat('Frames & Albums'),
      brandId: brand('Generic'),
      unitId: unit('Piece'),
      supplierId: supplier('Elgon'),
      description: 'A5 photo album with 200 pockets.',
      notes: '',
      buyingPrice: 25000,
      sellingPrice: 40000,
      taxRateId: null,
      reorderLevel: 8,
      openingStock: 20,
      currentStock: 18,
      status: 'active',
    },
    {
      name: 'HP 678 Ink Cartridge (Colour)',
      sku: 'SKU-1005',
      barcode: '6009876543258',
      categoryId: cat('Printer Consumables'),
      brandId: brand('HP'),
      unitId: unit('Piece'),
      supplierId: supplier('Kampala Print'),
      description: 'Genuine HP 678 colour ink cartridge.',
      notes: '',
      buyingPrice: 65000,
      sellingPrice: 95000,
      taxRateId: null,
      reorderLevel: 6,
      openingStock: 0,
      currentStock: 0,
      status: 'active',
    },
  ]

  return items.map((item) => ({ ...stampNew(SEED_USER, MAIN_BRANCH), ...item, imageDataUrl: null }))
}
