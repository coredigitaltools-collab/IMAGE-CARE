import { useState } from 'react'
import { useCreateUnit } from '../../features/inventory/hooks/useInventoryData'
import type { UnitOfMeasure } from '../../types/inventory'

const CREATE_NEW_VALUE = '__create_new__'

interface UnitQuickSelectProps {
  id: string
  units: UnitOfMeasure[]
  value: string
  onChange: (unitId: string) => void
  userId: string
  error?: string
}

// 2026-09-01: replaces a hidden input that silently pinned every product to
// a fake unit id ('piece', not a real uuid/row - see createUnit() in
// masterDataService.ts for the full story). Units of Measure is a real,
// per-business list (Settings -> Units), and a brand-new business starts
// with zero of them, so - same pattern as CategoryQuickSelect - this is a
// normal dropdown plus an always-available "+ Add new unit" option so a
// business is never blocked from adding its first product just because it
// hasn't visited Units first.
export function UnitQuickSelect({ id, units, value, onChange, userId, error }: UnitQuickSelectProps) {
  const createUnit = useCreateUnit(userId)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAbbreviation, setNewAbbreviation] = useState('')

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === CREATE_NEW_VALUE) {
      setIsCreating(true)
      setNewName('')
      setNewAbbreviation('')
    } else {
      onChange(e.target.value)
    }
  }

  const canCreate = newName.trim().length > 0 && newAbbreviation.trim().length > 0

  const confirmCreate = async () => {
    if (!canCreate) return
    const unit = await createUnit.mutateAsync({ name: newName.trim(), abbreviation: newAbbreviation.trim() })
    setIsCreating(false)
    onChange(unit.id)
  }

  if (isCreating) {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          New unit
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Unit name, e.g. Piece"
            className="w-full rounded-md border border-brand-blue-500 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          <input
            value={newAbbreviation}
            onChange={(e) => setNewAbbreviation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmCreate()
              }
            }}
            placeholder="Abbr., e.g. pcs"
            className="w-24 shrink-0 rounded-md border border-brand-blue-500 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          <button
            type="button"
            onClick={confirmCreate}
            disabled={!canCreate || createUnit.isPending}
            className="shrink-0 rounded-md bg-brand-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue-900 disabled:opacity-50"
          >
            {createUnit.isPending ? '…' : 'Add'}
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
        Unit
      </label>
      <select
        id={id}
        value={value}
        onChange={handleSelectChange}
        className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500 ${
          error ? 'border-brand-red-500' : 'border-ink-100'
        }`}
      >
        {units.length === 0 && <option value="">No units yet</option>}
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.abbreviation})
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Add new unit…</option>
      </select>
      {error && <p className="mt-1 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
}
