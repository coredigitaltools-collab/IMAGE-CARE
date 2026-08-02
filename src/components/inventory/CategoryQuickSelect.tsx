import { useState } from 'react'
import { useCreateCategory } from '../../features/inventory/hooks/useInventoryData'
import type { Category } from '../../types/inventory'

const CREATE_NEW_VALUE = '__create_new__'

interface CategoryQuickSelectProps {
  id: string
  categories: Category[]
  value: string
  onChange: (categoryId: string) => void
  userId: string
  error?: string
}

/** A normal category dropdown, plus an always-available "+ Add new
 *  category" option so a business is never limited to whatever
 *  categories happen to exist yet, including zero, on a fresh install.
 *  Typing a name and confirming creates the category for real (via the
 *  same service Settings → Categories uses) and selects it immediately. */
export function CategoryQuickSelect({ id, categories, value, onChange, userId, error }: CategoryQuickSelectProps) {
  const createCategory = useCreateCategory(userId)
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
    const category = await createCategory.mutateAsync({ name })
    setIsCreating(false)
    onChange(category.id)
  }

  if (isCreating) {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          New category name
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
            placeholder="Type a category name..."
            className="w-full rounded-md border border-brand-blue-500 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          <button
            type="button"
            onClick={confirmCreate}
            disabled={!newName.trim() || createCategory.isPending}
            className="shrink-0 rounded-md bg-brand-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue-900 disabled:opacity-50"
          >
            {createCategory.isPending ? '…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="shrink-0 rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
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
        Category
      </label>
      <select
        id={id}
        value={value}
        onChange={handleSelectChange}
        className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
      >
        {categories.length === 0 && <option value="">No categories yet</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Add new category…</option>
      </select>
      {error && <p className="mt-1 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
}
