import { useState } from 'react'
import { useCreateExpenseCategory } from '../../features/expenses/hooks/useExpensesData'
import type { ExpenseCategory } from '../../types/expenses'

const CREATE_NEW_VALUE = '__create_new__'

interface ExpenseCategorySelectProps {
  id: string
  categories: ExpenseCategory[]
  /** The category NAME (not id) - `expenses.category` has always been a
   *  plain-text column with no foreign key (see ExpenseFormModal's own
   *  history), so this stays a name to avoid touching that contract. The
   *  dropdown just makes sure that name always comes from a real,
   *  previously-created category instead of being freely typed. */
  value: string
  onChange: (categoryName: string) => void
  error?: string
}

/** Real dropdown of the business's expense categories (Expenses ->
 *  Categories), plus an always-available "+ Add new category" option so a
 *  business with zero categories yet is never blocked from recording its
 *  first expense - same pattern as CategoryQuickSelect (Inventory) and the
 *  supplier/branch quick-adds elsewhere in the app. Fixes the reported gap
 *  where a category created under Expenses -> Categories never showed up
 *  here (the old field was free text with autocomplete drawn from past
 *  EXPENSES, not from the categories a user actually created). */
export function ExpenseCategorySelect({ id, categories, value, onChange, error }: ExpenseCategorySelectProps) {
  const createCategory = useCreateExpenseCategory()
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
    onChange(category.name)
  }

  if (isCreating) {
    return (
      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-ink-700">
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
            placeholder="e.g. Advertising"
            className="w-full rounded-lg border border-brand-blue-500 bg-white px-4 py-3.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          <button
            type="button"
            onClick={confirmCreate}
            disabled={!newName.trim() || createCategory.isPending}
            className="shrink-0 rounded-lg bg-brand-blue-700 px-4 py-3.5 text-sm font-medium text-white hover:bg-brand-blue-900 disabled:opacity-50"
          >
            {createCategory.isPending ? '…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="shrink-0 rounded-lg border border-ink-100 bg-white px-4 py-3.5 text-sm text-ink-700 hover:bg-ink-50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-ink-700">
        Category
      </label>
      <select
        id={id}
        value={value}
        onChange={handleSelectChange}
        className={`w-full rounded-lg border bg-white px-4 py-3.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500 ${
          error ? 'border-brand-red-500' : 'border-ink-100 hover:border-ink-300'
        }`}
      >
        {categories.length === 0 && !value && <option value="">No categories yet - add one below</option>}
        {categories.length > 0 && !value && (
          <option value="" disabled>
            Select a category…
          </option>
        )}
        {/* Editing a record whose category isn't in the live (active)
            categories list - e.g. it was archived, or was typed before
            this dropdown existed. Show it as-is instead of blanking the
            field out from under the user; it's still a valid saved value
            unless they deliberately change it. */}
        {value && !categories.some((c) => c.name === value) && (
          <option value={value}>{value}</option>
        )}
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Add new category…</option>
      </select>
      {error && <p className="mt-1.5 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
}
