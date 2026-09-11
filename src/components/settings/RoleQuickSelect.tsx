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

  const startCreating = () => {
    setIsCreating(true)
    setNewName('')
    setCreateError(undefined)
  }

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === CREATE_NEW_VALUE) {
      startCreating()
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
            className="w-full rounded-md border border-brand-blue-500 bg-surface px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
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
            className="shrink-0 rounded-md border border-ink-100 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
        {createError && <p className="mt-1 text-xs text-brand-red-700">{createError}</p>}
        <p className="mt-1 text-xs text-ink-500">New roles start with no permissions, set them in the Permission Matrix below.</p>
      </div>
    )
  }

  // Bug fix (2026-09-06): "I am not able to add role." When a business has
  // zero real roles yet (imagecare.permission_groups genuinely empty - the
  // common case right after the 2026-09-05 fix reconnected this screen,
  // since nothing had ever been saved to the real table before that), this
  // <select> only ever has ONE option: "+ Add new role...". A native
  // select's onChange only fires when the user picks a DIFFERENT option
  // than the one already showing - with just one option there is nothing
  // else to pick, so clicking the only entry silently did nothing and the
  // create-role text field never appeared. Rendering a plain button
  // instead whenever there are no roles to choose from sidesteps that
  // entirely (a click always works), and it re-appears as a normal
  // dropdown the moment at least one real role exists.
  if (roles.length === 0) {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          Role
        </label>
        <button
          type="button"
          id={id}
          onClick={startCreating}
          className="w-full rounded-md border border-dashed border-ink-300 bg-surface px-3 py-2 text-left text-sm text-accent shadow-card hover:border-brand-blue-500 hover:bg-brand-blue-50"
        >
          + Add new role…
        </button>
        <p className="mt-1 text-xs text-ink-500">No roles set up yet - add one to assign staff permissions.</p>
        {error && <p className="mt-1 text-xs text-brand-red-700">{error}</p>}
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
        className="w-full rounded-md border border-ink-100 bg-surface px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
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
