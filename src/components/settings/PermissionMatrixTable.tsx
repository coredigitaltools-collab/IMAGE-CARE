import { Lock } from 'lucide-react'
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  type PermissionMatrix,
  type StaffRole,
} from '../../types/settings'

interface PermissionMatrixTableProps {
  matrix: PermissionMatrix
  onChange: (role: StaffRole, permission: (typeof PERMISSIONS)[number], granted: boolean) => void
  disabled?: boolean
}

export function PermissionMatrixTable({ matrix, onChange, disabled }: PermissionMatrixTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-ink-100 px-3 py-2 text-left font-medium text-ink-500">Permission</th>
            {STAFF_ROLES.map((role) => (
              <th key={role} className="border-b border-ink-100 px-3 py-2 text-center font-medium text-ink-500">
                <div className="flex items-center justify-center gap-1">
                  {STAFF_ROLE_LABELS[role]}
                  {role === 'owner' && <Lock size={11} className="text-ink-300" aria-label="Locked" />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((permission) => (
            <tr key={permission} className="border-b border-ink-100 last:border-0">
              <td className="px-3 py-2.5 text-ink-900">{PERMISSION_LABELS[permission]}</td>
              {STAFF_ROLES.map((role) => (
                <td key={role} className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={matrix[role][permission]}
                    disabled={role === 'owner' || disabled}
                    onChange={(e) => onChange(role, permission, e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`${PERMISSION_LABELS[permission]} — ${STAFF_ROLE_LABELS[role]}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
