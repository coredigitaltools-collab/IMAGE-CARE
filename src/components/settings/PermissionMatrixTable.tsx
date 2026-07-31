import { Lock, Plus, Trash2 } from 'lucide-react'
import { PERMISSIONS, PERMISSION_LABELS, OWNER_ROLE_ID, type PermissionMatrix, type RoleDefinition } from '../../types/settings'

interface PermissionMatrixTableProps {
  matrix: PermissionMatrix
  roles: RoleDefinition[]
  onChange: (role: string, permission: (typeof PERMISSIONS)[number], granted: boolean) => void
  onAddRole: () => void
  onArchiveRole: (role: RoleDefinition) => void
  disabled?: boolean
}

export function PermissionMatrixTable({ matrix, roles, onChange, onAddRole, onArchiveRole, disabled }: PermissionMatrixTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-ink-100 px-3 py-2 text-left font-medium text-ink-500">Permission</th>
            {roles.map((role) => (
              <th key={role.id} className="border-b border-ink-100 px-3 py-2 text-center font-medium text-ink-500">
                <div className="flex items-center justify-center gap-1">
                  {role.name}
                  {role.id === OWNER_ROLE_ID ? (
                    <Lock size={11} className="text-ink-300" aria-label="Locked" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onArchiveRole(role)}
                      aria-label={`Remove ${role.name} role`}
                      title="Remove this role"
                      className="text-ink-300 hover:text-brand-red-700"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th className="border-b border-ink-100 px-3 py-2 text-center">
              <button
                type="button"
                onClick={onAddRole}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-blue-700 hover:bg-brand-blue-50"
              >
                <Plus size={12} /> Add role
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((permission) => (
            <tr key={permission} className="border-b border-ink-100 last:border-0">
              <td className="px-3 py-2.5 text-ink-900">{PERMISSION_LABELS[permission]}</td>
              {roles.map((role) => (
                <td key={role.id} className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={matrix[role.id]?.[permission] ?? false}
                    disabled={role.id === OWNER_ROLE_ID || disabled}
                    onChange={(e) => onChange(role.id, permission, e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`${PERMISSION_LABELS[permission]} — ${role.name}`}
                  />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
