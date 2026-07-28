import {
  Building2,
  Users,
  MapPin,
  Percent,
  Receipt,
  Boxes,
  ShoppingCart,
  Bell,
  DatabaseBackup,
  RefreshCw,
  Palette,
  Info,
} from 'lucide-react'
import { SettingsSectionCard } from '../../components/settings/SettingsSectionCard'

const SECTIONS = [
  { to: '/settings/business-profile', icon: Building2, title: 'Business Profile', description: 'Name, contact details, default currency' },
  { to: '/settings/people', icon: Users, title: 'People & Access', description: 'Staff, roles, and the permission matrix' },
  { to: '/settings/branches', icon: MapPin, title: 'Branch Management', description: 'Locations, branch codes, contact info' },
  { to: '/settings/tax', icon: Percent, title: 'Tax Settings', description: 'Tax rates and default tax handling' },
  { to: '/settings/receipts', icon: Receipt, title: 'Receipt Settings', description: 'Footer message, logo, tax breakdown' },
  { to: '/settings/inventory', icon: Boxes, title: 'Inventory Settings', description: 'Default reorder level, SKU prefix' },
  { to: '/settings/sales', icon: ShoppingCart, title: 'Sales Settings', description: 'Discount limits, credit sale rules' },
  { to: '/settings/notifications', icon: Bell, title: 'Notifications', description: 'Low stock alerts, daily summary email' },
  { to: '/settings/backup', icon: DatabaseBackup, title: 'Backup & Restore', description: 'Export or restore a full data backup' },
  { to: '/settings/sync', icon: RefreshCw, title: 'Synchronization', description: 'Pending changes and last sync time' },
  { to: '/settings/appearance', icon: Palette, title: 'Appearance', description: 'Layout density, date format' },
  { to: '/settings/about', icon: Info, title: 'About', description: 'App version and support information' },
]

export function SettingsLandingPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">Administration centre for ImageCare</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((section) => (
          <SettingsSectionCard key={section.to} {...section} />
        ))}
      </div>
    </div>
  )
}
