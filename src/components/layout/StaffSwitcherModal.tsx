import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { useApp } from '../../context/AppContext'
import { useStaff } from '../../features/settings/hooks/useSettingsData'

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

export function StaffSwitcherModal({ onClose }: StaffSwitcherModalProps) {
  const { switchToStaff } = useApp()
  const staffQuery = useStaff()
  const [selected, setSelected] = useState<{ id: string; fullName: string } | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const staffList = (staffQuery.data ?? []).filter((s) => s.is_active && !s.is_owner)

  const chooseStaff = (member: { id: string; fullName: string }) => {
    setSelected(member)
    setPin('')
    setError(undefined)
  }

  const handlePinChange = async (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    setPin(digits)
    setError(undefined)
    if (digits.length === 4 && selected && !isSubmitting) {
      setIsSubmitting(true)
      const result = await switchToStaff(selected.id, digits)
      setIsSubmitting(false)
      if (result.success) {
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
            {staffList.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => member.hasPin && chooseStaff({ id: member.id, fullName: member.fullName })}
                disabled={!member.hasPin}
                className="flex w-full items-center justify-between rounded-lg border border-ink-100 px-4 py-3 text-left text-sm font-medium text-ink-900 transition-colors hover:border-brand-blue-500 hover:bg-brand-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>{member.fullName}</span>
                <span className="text-xs font-normal text-ink-500">
                  {member.hasPin ? (member.jobTitle || member.role) : 'No PIN set'}
                </span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div>
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
