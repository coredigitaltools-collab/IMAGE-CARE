import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from './FormField'
import { FormRow } from './FormRow'
import { RoleQuickSelect } from './RoleQuickSelect'
import { Button } from '../ui/Button'
import type { BranchRecord, RoleDefinition, StaffInput, StaffMember } from '../../types/settings'

// Bug fix (2026-09-05): "Add staff" used to require an email + password
// (a real Supabase Auth login, created via a server-side Edge Function).
// That path never once reached Supabase in production for this owner (a
// client network issue - see claude/add-staff-not-persisting-fix-2026-09-04.md)
// and, separately, the owner asked for a simpler model matching a
// reference product ("TRAXXO"): name, optional job title, a 4-digit PIN,
// optional phone/salary - no email, no password, no separate login
// account. Staff identify themselves with their PIN on a shared,
// already-signed-in device (see StaffSwitcherModal) instead of signing in
// themselves. Email/username fields are gone from this form entirely.
const formFields = {
  fullName: z.string().trim().min(1, 'Full name is required.'),
  jobTitle: z.string().trim().optional(),
  role: z.string().min(1, 'Select a role.'),
  branchIds: z.array(z.string()).min(1, 'Assign at least one branch.'),
  phone: z.string().trim().optional(),
  monthlySalary: z.string().trim().optional(),
}

// PIN is required to create a new staff member (that's their only way to
// identify themselves) but is not part of the Edit form - changing an
// existing staff member's PIN goes through the separate "Reset PIN"
// action instead, so one accidental edit can never silently lock them out.
const createSchema = z.object({
  ...formFields,
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits.'),
})
const editSchema = z.object({ ...formFields, pin: z.string().optional() })

// The form's own shape - every field is free text (HTML inputs only ever
// produce strings), unlike StaffInput.monthlySalary (a number). `submit`
// below converts between the two before calling onSubmit.
interface FormValues {
  fullName: string
  jobTitle?: string
  role: string
  branchIds: string[]
  phone?: string
  monthlySalary?: string
  pin?: string
}

interface StaffFormModalProps {
  branches: BranchRecord[]
  roles: RoleDefinition[]
  userId: string
  initial?: StaffMember
  onClose: () => void
  onSubmit: (input: StaffInput) => Promise<void>
  submitError?: string
}

export function StaffFormModal({ branches, roles, userId, initial, onClose, onSubmit, submitError }: StaffFormModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(initial ? editSchema : createSchema),
    defaultValues: initial
      ? {
          fullName: initial.fullName,
          jobTitle: initial.jobTitle ?? '',
          role: initial.role,
          branchIds: initial.branchIds,
          phone: initial.phone ?? '',
          monthlySalary: initial.monthlySalary != null ? String(initial.monthlySalary) : '',
        }
      : {
          fullName: '',
          jobTitle: '',
          role: roles.find((r) => r.id !== 'owner')?.id ?? roles[0]?.id ?? '',
          branchIds: [],
          phone: '',
          monthlySalary: '',
          pin: '',
        },
  })

  const selectedBranchIds = watch('branchIds')
  const selectedRole = watch('role')

  const toggleBranch = (id: string) => {
    const next = selectedBranchIds.includes(id)
      ? selectedBranchIds.filter((b) => b !== id)
      : [...selectedBranchIds, id]
    setValue('branchIds', next, { shouldValidate: true, shouldDirty: true })
  }

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      ...values,
      // Monthly Salary is optional and typed as free text in the form (a
      // plain numeric <input>) - normalize blank to undefined rather than
      // sending an empty string or NaN through to the database.
      monthlySalary: values.monthlySalary?.trim() ? Number(values.monthlySalary) : undefined,
      jobTitle: values.jobTitle?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
    })
  })

  return (
    <Modal title={initial ? 'Edit staff member' : 'Add staff member'} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-5">
        <FormField label="Full name" placeholder="e.g. Joy Nakato" {...register('fullName')} error={errors.fullName?.message} />

        <FormRow>
          <FormField label="Position (optional)" placeholder="e.g. Cashier" {...register('jobTitle')} error={errors.jobTitle?.message} />
          {!initial && (
            <FormField
              label="4-Digit PIN"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              {...register('pin')}
              error={errors.pin?.message}
            />
          )}
        </FormRow>

        <RoleQuickSelect
          id="role"
          roles={roles}
          value={selectedRole}
          onChange={(roleId) => setValue('role', roleId, { shouldValidate: true, shouldDirty: true })}
          userId={userId}
          error={errors.role?.message}
        />

        <FormRow>
          <FormField label="Phone (optional)" type="tel" placeholder="e.g. 0700111222" {...register('phone')} error={errors.phone?.message} />
          <FormField label="Monthly Salary (optional)" inputMode="decimal" placeholder="e.g. 150000" {...register('monthlySalary')} error={errors.monthlySalary?.message} />
        </FormRow>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-700">Assigned branches</p>
          <div className="space-y-1.5 rounded-md border border-ink-100 p-3">
            {branches.map((branch) => (
              <label key={branch.id} className="flex items-center gap-2 text-sm text-ink-900">
                <input
                  type="checkbox"
                  checked={selectedBranchIds.includes(branch.id)}
                  onChange={() => toggleBranch(branch.id)}
                  className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
                />
                {branch.name}
              </label>
            ))}
          </div>
          {errors.branchIds && <p className="mt-1 text-xs text-brand-red-700">{errors.branchIds.message}</p>}
        </div>

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : initial ? 'Save' : 'Add Staff'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
