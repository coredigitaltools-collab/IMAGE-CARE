import { useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { useApp, useActiveBranch } from '../../context/AppContext'
import { useStaff, useBranches, useRoles } from '../../features/settings/hooks/useSettingsData'

// ============================================================
// ImageCare ERP - Staff Switcher ("Who is using this device?")
// File: src/components/layout/StaffSwitcherModal.tsx
//
// PIN-only staff identification (2026-09-05, see
// 0030_stage9_pin_staff.sql / AppContext's switchToStaff()). This does
// NOT sign anyone in or out - the owner's own Supabase Auth session
// keeps running underneath the whole time. It just records which staff
// member is now at the keyboard, verified against their own PIN
// (rate-limited server-side, same as the owner's own unlock PIN), so the
// header can show who's operating a shared device and the sidebar can
// hide Settings while they are.
// ============================================================

interface StaffSwitcherModalProps {
  onClose: () => void
}

interface SelectedStaff {
  id: string
  fullName: string
  branchId: string | null
}

export function StaffSwitcherModal({ onClose }: StaffSwitcherModalProps) {
  const { switchToStaff, setActiveBranchId } = useApp()
  const activeBranchId = useActiveBranch()
  const staffQuery = useStaff()
  const branchesQuery = useBranches()
  const rolesQuery = useRoles()
  const [selected, setSelected] = useState<SelectedStaff | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const staffList = (staffQuery.data ?? []).filter((s) => s.is_active && !s.is_owner)

  // Bug fix (2026-09-07): "why do the names show long numbers instead of
  // role." `member.role` is the raw imagecare.users.role column, which -
  // ever since Roles became real permission_groups rows (2026-09-05) -
  // stores that group's UUID, not a readable name (a plain job_title, when
  // set, happened to mask this - see Mariam vs Abdul/Simon in the reported
  // screenshot). PeopleAccessPage.tsx already resolves this correctly via
  // useRoles(); this modal just never did the same lookup.
  const roles = rolesQuery.data ?? []
  const roleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? 'Staff'

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of branchesQuery.data ?? []) map.set(b.id, b.name)
    return map
  }, [branchesQuery.data])
  const activeBranchName = activeBranchId ? branchNameById.get(activeBranchId) : undefined

  // Feature request (2026-09-07): "i want the names of staff to show the
  // branch" - each row now shows which branch a staff member is actually
  // assigned to, not just their role.
  const branchLabelFor = (branchId: string | null) => (branchId ? branchNameById.get(branchId) ?? 'Unknown branch' : 'No branch assigned')

  const chooseStaff = (member: { id: string; fullName: string; branchId: string | null }) => {
    setSelected(member)
    setPin('')
    setError(undefined)
  }

  // Bug fix (2026-09-07): "I clicked abdul as the staff in nkoowe and the
  // system did not flag that." Abdul is only assigned to Machakos - this
  // modal used to let the owner switch to any active staff member with no
  // regard for which branch was currently active, and switchToStaff()
  // itself never touched activeBranchId either. That silently left the
  // header (and everything driven by it - Sales, Reports, Record Sale's
  // own product picker once its branch is already set) pointed at a
  // branch Abdul has no real access to, with nothing on screen saying so.
  // mismatchedBranch is shown as an inline notice on the PIN step, and a
  // successful switch now also moves the active branch to the staff
  // member's own branch - so the till can never end up silently
  // mismatched between "who's operating it" and "which branch is active".
  const mismatchedBranch =
    selected?.branchId && activeBranchId && selected.branchId !== activeBranchId
      ? branchNameById.get(selected.branchId) ?? 'their assigned branch'
      : null

  const handlePinChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    setPin(digits)
    setError(undefined)
    if (digits.length === 4 && selected && !isSubmitting) {
      setIsSubmitting(true)
      const result = await switchToStaff(selected.id, digits)
      setIsSubmitting(false)
      if (result.success) {
        if (selected.branchId && selected.branchId !== activeBranchId) {
          setActiveBranchId(selected.branchId)
        }
        onClose()
      } else {
        setError(result.error ?? 'Incorrect PIN.')
        setPin('')
      }
    }
  }

  return (
    <Modal title={selected ? `Enter PIN for ${selected.fullName}` : 'Who is using this device?'} onClose={onClose}>
      {!selected ? (
        staffQuery.isLoading ? (
          <p className="text-sm text-ink-500">Loading staff…</p>
        ) : staffList.length === 0 ? (
          <p className="text-sm text-ink-500">
            No active staff members yet. Add one from Settings → People &amp; Access.
          </p>
        ) : (
          <div className="space-y-2">
            {staffList.map((member) => {
              const branchId = member.branchIds[0] ?? null
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => member.hasPin && chooseStaff({ id: member.id, fullName: member.fullName, branchId })}
                  disabled={!member.hasPin}
                  className="flex w-full items-center justify-between rounded-lg border border-ink-100 px-4 py-3 text-left text-sm font-medium text-ink-900 transition-colors hover:border-brand-blue-500 hover:bg-brand-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{member.fullName}</span>
                  <span className="text-right text-xs font-normal text-ink-500">
                    {member.hasPin ? (
                      <>
                        {member.jobTitle || roleName(member.role)}
                        <span className="text-ink-400"> · {branchLabelFor(branchId)}</span>
                      </>
                    ) : (
                      'No PIN set'
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )
      ) : (
        <div>
          {mismatchedBranch && (
            <p className="mb-3 rounded-lg bg-brand-blue-50 px-3 py-2.5 text-xs text-brand-blue-900">
              {selected.fullName} is assigned to <strong>{mismatchedBranch}</strong>
              {activeBranchName ? <>, not the currently active branch (<strong>{activeBranchName}</strong>)</> : null}. Continuing will switch the active branch to {mismatchedBranch}.
            </p>
          )}
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => void handlePinChange(e.target.value)}
            disabled={isSubmitting}
            placeholder="••••"
            aria-label={`Enter PIN for ${selected.fullName}`}
            className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3.5 text-center text-2xl tracking-[0.5em] text-ink-900 shadow-card focus:border-brand-blue-500 focus:outline-none"
          />
          {error && <p className="mt-2 text-center text-xs text-brand-red-700">{error}</p>}
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-4 w-full text-center text-xs font-medium text-brand-blue-700 hover:underline"
          >
            Choose a different staff member
          </button>
        </div>
      )}
    </Modal>
  )
}
