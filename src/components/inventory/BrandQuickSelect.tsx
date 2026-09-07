import { useState } from 'react'
import { useCreateBrand } from '../../features/inventory/hooks/useInventoryData'
import type { Brand } from '../../types/inventory'

const CREATE_NEW_VALUE = '__create_new__'

interface BrandQuickSelectProps {
  id: string
  brands: Brand[]
  value: string
  onChange: (brandId: string) => void
  userId: string
  error?: string
}

// Bug fix (2026-09-06): "i can not add Brand" - the Brand field on Add
// product was a plain <select> of whatever brands already existed (or just
// "None" on a business with zero brands yet, e.g. a newly set-up branch
// with a different product line), with no way to add a new one without
// leaving the form and finding the separate Brands settings page first.
// Not a branch-specific restriction - brands aren't branch-scoped at all -
// this was missing everywhere, for every branch. Mirrors
// CategoryQuickSelect.tsx exactly: a normal dropdown plus an
// always-available "+ Add new brand" option, so a business (or a branch
// selling a different product line) is never blocked on a brand that
// doesn't exist yet. Typing a name and confirming creates the brand for
// real (via the same service the Brands settings page uses) and selects it
// immediately. "None" stays a real, separate choice since Brand - unlike
// Category - is optional.
export function BrandQuickSelect({ id, brands, value, onChange, userId, error }: BrandQuickSelectProps) {
  const createBrand = useCreateBrand(userId)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === CREATE_NEW_VALUE) {
      setIsCreating(true)
      setNewName('')
    } else {
      onChange(e.target.value)
    }
  }

  const confirmCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const brand = await createBrand.mutateAsync({ name })
    setIsCreating(false)
    onChange(brand.id)
  }

  if (isCreating) {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          New brand name
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmCreate()
              }
            }}
            placeholder="Type a brand name..."
            className="w-full rounded-md border border-brand-blue-500 bg-surface px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          <button
            type="button"
            onClick={confirmCreate}
            disabled={!newName.trim() || createBrand.isPending}
            className="shrink-0 rounded-md bg-brand-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue-900 disabled:opacity-50"
          >
            {createBrand.isPending ? '…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="shrink-0 rounded-md border border-ink-100 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
        Brand
      </label>
      <select
        id={id}
        value={value}
        onChange={handleSelectChange}
        className="w-full rounded-md border border-ink-100 bg-surface px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
      >
        <option value="">None</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Add new brand…</option>
      </select>
      {error && <p className="mt-1 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
}
