import { useState } from 'react'
import { useCreateRole } from '../../features/settings/hooks/useSettingsData'
import { DuplicateRoleNameError } from '../../services/roleService'
import type { RoleDefinition } from '../../types/settings'

const CREATE_NEW_VALUE = '__create_new__'

interface RoleQuickSelectProps {
  id: string
  roles: RoleDefinition[]
  value: string
  onChange: (roleId: string) => void
  userId: string
  error?: string
}

/** A role dropdown plus an always-available "+ Add new role" option, a
 *  business is never limited to Owner/Manager/Cashier/Accountant. Typing
 *  a name and confirming creates a real role (the same catalogue the
 *  Permission Matrix reads from) and selects it immediately; its
 *  permissions default to none until configured in the matrix. */
export function RoleQuickSelect({ id, roles, value, onChange, userId, error }: RoleQuickSelectProps) {
  const createRole = useCreateRole(userId)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | undefined>()

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === CREATE_NEW_VALUE) {
      setIsCreating(true)
      setNewName('')
      setCreateError(undefined)
    } else {
      onChange(e.target.value)
    }
  }

  const confirmCreate = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const role = await createRole.mutateAsync({ name })
      setIsCreating(false)
      onChange(role.id)
    } catch (err) {
      setCreateError(err instanceof DuplicateRoleNameError ? err.message : 'Could not create this role.')
    }
  }

  if (isCreating) {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          New role name
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
            placeholder="e.g. Social Media Manager, Warehouse Assistant..."
            className="w-full rounded-md border border-brand-blue-500 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          <button
            type="button"
            onClick={confirmCreate}
            disabled={!newName.trim() || createRole.isPending}
            className="shrink-0 rounded-md bg-brand-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue-900 disabled:opacity-50"
          >
            {createRole.isPending ? '…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="shrink-0 rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
          >
            Cancel
          </button>
        </div>
        {createError && <p className="mt-1 text-xs text-brand-red-700">{createError}</p>}
        <p className="mt-1 text-xs text-ink-500">New roles start with no permissions, set them in the Permission Matrix below.</p>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
        Role
      </label>
      <select
        id={id}
        value={value}
        onChange={handleSelectChange}
        className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Add new role…</option>
      </select>
      {error && <p className="mt-1 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
}
