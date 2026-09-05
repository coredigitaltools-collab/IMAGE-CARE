import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import type { RoleDefinition, StaffMember } from '../../types/settings'

interface AddEmployeeToPayrollModalProps {
  eligibleStaff: StaffMember[]
  roles: RoleDefinition[]
  onClose: () => void
  onSubmit: (staffId: string, baseSalaryUgx: number) => Promise<void>
  submitError?: string
}

// Bug fix (2026-09-05): this used to print the raw StaffMember.role value
// directly ("Mariam (49fd3528-...)") - `role` is the role catalogue's id
// (see types/settings.ts), a plain UUID for any custom role, not a display
// name. PeopleAccessPage already resolves it through the roles list
// (its `roleName` helper); this does the same instead of showing the id.
export function AddEmployeeToPayrollModal({ eligibleStaff, roles, onClose, onSubmit, submitError }: AddEmployeeToPayrollModalProps) {
  const roleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? 'Unknown role'
  const [staffId, setStaffId] = useState(eligibleStaff[0]?.id ?? '')
  const [baseSalary, setBaseSalary] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(staffId, baseSalary)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Add employee to payroll" onClose={onClose}>
      {eligibleStaff.length === 0 ? (
        <p className="text-sm text-ink-500">
          Every active staff member is already on payroll. Add someone new under Settings → People & Access first.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="ep-staff" className="mb-1.5 block text-sm font-medium text-ink-700">
              Staff member
            </label>
            <select
              id="ep-staff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {eligibleStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.is_owner ? 'Owner' : roleName(s.role)})
                </option>
              ))}
            </select>
          </div>
          <NumberField id="ep-salary" label="Base salary (UGX)" min={0} value={baseSalary} onChange={setBaseSalary} />
          {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add to payroll'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
