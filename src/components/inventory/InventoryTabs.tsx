import { Link, useLocation } from 'react-router-dom'
import { useBrands, useCategories, useProducts, useSuppliers } from '../../features/inventory/hooks/useInventoryData'

export function InventoryTabs() {
  const location = useLocation()

  const productsQuery = useProducts()
  const categoriesQuery = useCategories()
  const brandsQuery = useBrands()
  const suppliersQuery = useSuppliers()

  // Counts mirror what each destination page shows by default: active
  // products (archived ones are hidden until toggled), active
  // categories/brands/units, and every supplier (the Suppliers page has
  // no archived filter, it always shows all statuses).
  const counts: Record<string, number | undefined> = {
    '/inventory/products': productsQuery.data?.filter((p) => p.status === 'active').length,
    '/inventory/categories': categoriesQuery.data?.filter((c) => c.is_active).length,
    '/inventory/brands': brandsQuery.data?.filter((b) => b.is_active).length,
    '/inventory/suppliers': suppliersQuery.data?.length,
  }

  const TABS = [
    { to: '/inventory', label: 'Dashboard', exact: true },
    { to: '/inventory/products', label: 'Products' },
    { to: '/inventory/categories', label: 'Categories' },
    { to: '/inventory/brands', label: 'Brands' },
    { to: '/inventory/suppliers', label: 'Suppliers' },
    { to: '/inventory/movements', label: 'Stock Movements' },
    { to: '/inventory/adjustments', label: 'Adjustments' },
    { to: '/inventory/barcode', label: 'Barcode' },
    { to: '/inventory/reports', label: 'Reports' },
  ]

  return (
    <nav className="mb-6 -mx-1 overflow-x-auto pb-1">
      <ul className="flex items-center gap-1 px-1">
        {TABS.map((tab) => {
          const isActive = tab.exact ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
          const count = counts[tab.to]
          return (
            <li key={tab.to} className="shrink-0">
              <Link
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'block whitespace-nowrap rounded-md bg-brand-blue-50 px-3 py-1.5 text-sm font-medium text-brand-blue-700'
                    : 'block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-900'
                }
              >
                {tab.label}
                {count !== undefined && <span className={isActive ? 'ml-1 text-brand-blue-500' : 'ml-1 text-ink-300'}>({count})</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
