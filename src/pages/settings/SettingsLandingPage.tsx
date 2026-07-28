import { useMemo, useState } from 'react'
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
  Search,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SettingsSectionCard } from '../../components/settings/SettingsSectionCard'

interface SettingsSection {
  to: string
  icon: LucideIcon
  title: string
  description: string
}

interface SettingsCategory {
  name: string
  sections: SettingsSection[]
}

// Adding a new settings section later is a two-line change: add it to the
// relevant category's `sections` array (or a new category object) below.
// Nothing else on this page needs to change — search and layout both work
// off this data.
const CATEGORIES: SettingsCategory[] = [
  {
    name: 'Business',
    sections: [
      {
        to: '/settings/business-profile',
        icon: Building2,
        title: 'Business Profile',
        description: 'Manage your business identity, branding, and contact information.',
      },
      {
        to: '/settings/branches',
        icon: MapPin,
        title: 'Branch Management',
        description: 'Create, update, and manage business branches.',
      },
      {
        to: '/settings/tax',
        icon: Percent,
        title: 'Tax Settings',
        description: 'Configure taxes, VAT, and default tax behaviour.',
      },
    ],
  },
  {
    name: 'Operations',
    sections: [
      {
        to: '/settings/inventory',
        icon: Boxes,
        title: 'Inventory Settings',
        description: 'Configure stock defaults, reorder levels, and inventory behaviour.',
      },
      {
        to: '/settings/sales',
        icon: ShoppingCart,
        title: 'Sales Settings',
        description: 'Configure invoice numbering, discounts, returns, and credit sales.',
      },
      {
        to: '/settings/receipts',
        icon: Receipt,
        title: 'Receipt Settings',
        description: 'Customize receipt branding, printing, and layout.',
      },
    ],
  },
  {
    name: 'Security & Access',
    sections: [
      {
        to: '/settings/people',
        icon: Users,
        title: 'People & Access',
        description: 'Manage staff accounts, roles, permissions, and user access.',
      },
      {
        to: '/settings/backup',
        icon: DatabaseBackup,
        title: 'Backup & Restore',
        description: 'Export, restore, and safeguard business data.',
      },
      {
        to: '/settings/sync',
        icon: RefreshCw,
        title: 'Synchronization',
        description: 'Monitor cloud synchronization and offline status.',
      },
    ],
  },
  {
    name: 'System',
    sections: [
      {
        to: '/settings/notifications',
        icon: Bell,
        title: 'Notifications',
        description: 'Configure alerts, reminders, and system notifications.',
      },
      {
        to: '/settings/appearance',
        icon: Palette,
        title: 'Appearance',
        description: 'Customize language, dates, currency, and visual preferences.',
      },
      {
        to: '/settings/about',
        icon: Info,
        title: 'About',
        description: 'View system information, version, and support details.',
      },
    ],
  },
]

export function SettingsLandingPage() {
  const [query, setQuery] = useState('')

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES.map((category) => ({
      ...category,
      sections: category.sections.filter(
        (section) => section.title.toLowerCase().includes(q) || section.description.toLowerCase().includes(q),
      ),
    })).filter((category) => category.sections.length > 0)
  }, [query])

  const hasResults = filteredCategories.length > 0

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">Administration centre for ImageCare</p>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings..."
          aria-label="Search settings"
          className="w-full rounded-md border border-ink-100 bg-white py-2 pl-9 pr-9 text-sm text-ink-900 shadow-card transition-colors placeholder:text-ink-300 hover:border-ink-300 focus:border-brand-blue-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {!hasResults && (
        <p className="py-8 text-center text-sm text-ink-500">No settings match "{query}".</p>
      )}

      {filteredCategories.map((category) => (
        <div key={category.name}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{category.name}</h2>
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {category.sections.map((section) => (
              <SettingsSectionCard key={section.to} {...section} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
