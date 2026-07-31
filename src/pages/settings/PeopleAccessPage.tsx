import { useState } from 'react'
import { KeyRound, Plus, ShieldCheck, UserX } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { RoleBadge } from '../../components/settings/RoleBadge'
import { StaffFormModal } from '../../components/settings/StaffFormModal'
import { PermissionMatrixTable } from '../../components/settings/PermissionMatrixTable'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import {
  useArchiveRole,
  useBranches,
  useCreateRole,
  useCreateStaff,
  useDisableStaff,
  usePermissionMatrix,
  useReactivateStaff,
  useResetStaffPassword,
  useRoles,
  useSetPermission,
  useStaff,
  useUpdateStaff,
} from '../../features/settings/hooks/useSettingsData'
import type { StaffInput, StaffMember } from '../../types/settings'
import { DuplicateUsernameError, LastActiveOwnerError } from '../../services/staffService'
import { DuplicateRoleNameError, OwnerRoleProtectedError, RoleInUseError } from '../../services/roleService'

export function PeopleAccessPage() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const staffQuery = useStaff()
  const branchesQuery = useBranches()
  const rolesQuery = useRoles()
  const permissionMatrixQuery = usePermissionMatrix()

  const createStaff = useCreateStaff(user.id)
  const updateStaff = useUpdateStaff(user.id)
  const disableStaff = useDisableStaff(user.id)
  const reactivateStaff = useReactivateStaff(user.id)
  const resetPassword = useResetStaffPassword()
  const setPermission = useSetPermission(user.id)
  const createRole = useCreateRole(user.id)
  const archiveRole = useArchiveRole(user.id)

  const roles = rolesQuery.data ?? []
  const activeRoles = roles.filter((r) => r.is_active)
  const roleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? 'Unknown role'

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; staff: StaffMember } | null>(null)
  const [formError, setFormError] = useState<string | undefined>()

  const branches = branchesQuery.data ?? []

  const handleSubmit = async (input: StaffInput) => {
    setFormError(undefined)
    try {
      if (modalState?.mode === 'edit') {
        await updateStaff.mutateAsync({ id: modalState.staff.id, input })
        showToast('Staff member updated.', 'success')
      } else {
        await createStaff.mutateAsync(input)
        showToast('Staff member added.', 'success')
      }
      setModalState(null)
    } catch (err) {
      if (err instanceof DuplicateUsernameError || err instanceof LastActiveOwnerError) {
        setFormError(err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    }
  }

  const handleDisable = async (member: StaffMember) => {
    try {
      await disableStaff.mutateAsync(member.id)
      showToast(`${member.fullName} disabled.`, 'success')
    } catch (err) {
      showToast(err instanceof LastActiveOwnerError ? err.message : 'Could not disable this staff member.')
    }
  }

  const handleResetPassword = async (member: StaffMember) => {
    const result = await resetPassword.mutateAsync(member.id)
    showToast(`Temporary password for ${member.fullName}: ${result.temporaryPassword}`)
  }

  const handleAddRole = async () => {
    const name = window.prompt('New role name (e.g. Social Media Manager, Warehouse Assistant)')
    if (!name?.trim()) return
    try {
      await createRole.mutateAsync({ name })
      showToast('Role added — set its permissions below.', 'success')
    } catch (err) {
      showToast(err instanceof DuplicateRoleNameError ? err.message : 'Could not create this role.')
    }
  }

  const handleArchiveRole = async (role: { id: string; name: string }) => {
    if (!window.confirm(`Remove the "${role.name}" role?`)) return
    try {
      await archiveRole.mutateAsync(role.id)
      showToast('Role removed.', 'success')
    } catch (err) {
      showToast(err instanceof OwnerRoleProtectedError || err instanceof RoleInUseError ? err.message : 'Could not remove this role.')
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsPageHeader
        title="People & Access"
        description="Staff accounts, branch assignment, and role permissions."
        action={
          <Button onClick={() => setModalState({ mode: 'create' })}>
            <Plus size={15} /> Add staff
          </Button>
        }
      />

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Staff</h2>
        {staffQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {(staffQuery.data ?? []).map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink-900">{member.fullName}</p>
                    <RoleBadge roleId={member.role} roleName={roleName(member.role)} />
                    {!member.is_active && (
                      <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-500">Disabled</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500">
                    @{member.username} · {member.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => setModalState({ mode: 'edit', staff: member })}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleResetPassword(member)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                  >
                    <KeyRound size={13} /> Reset password
                  </button>
                  {member.is_active ? (
                    <button
                      onClick={() => handleDisable(member)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-red-700 hover:bg-brand-red-50"
                    >
                      <UserX size={13} /> Disable
                    </button>
                  ) : (
                    <button
                      onClick={() => reactivateStaff.mutate(member.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-success-700 hover:bg-success-100"
                    >
                      <ShieldCheck size={13} /> Reactivate
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink-900">Permission matrix</h2>
        <p className="mb-4 text-xs text-ink-500">
          Owners always have unrestricted access. Changes apply immediately.
        </p>
        {permissionMatrixQuery.isLoading || rolesQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : permissionMatrixQuery.data ? (
          <PermissionMatrixTable
            matrix={permissionMatrixQuery.data}
            roles={activeRoles}
            onChange={(role, permission, granted) => setPermission.mutate({ role, permission, granted })}
            onAddRole={handleAddRole}
            onArchiveRole={handleArchiveRole}
            disabled={setPermission.isPending}
          />
        ) : null}
      </Card>

      {modalState && (
        <StaffFormModal
          branches={branches}
          roles={activeRoles}
          userId={user.id}
          initial={modalState.mode === 'edit' ? modalState.staff : undefined}
          onClose={() => {
            setModalState(null)
            setFormError(undefined)
          }}
          onSubmit={handleSubmit}
          submitError={formError}
        />
      )}
    </div>
  )
}
