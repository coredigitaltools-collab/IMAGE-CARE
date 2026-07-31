import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from './FormField'
import { RoleQuickSelect } from './RoleQuickSelect'
import { Button } from '../ui/Button'
import type { BranchRecord, RoleDefinition, StaffInput, StaffMember } from '../../types/settings'

const schema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required.'),
  username: z.string().trim().min(3, 'Username must be at least 3 characters.'),
  email: z.string().trim().email('Enter a valid email address.'),
  role: z.string().min(1, 'Select a role.'),
  branchIds: z.array(z.string()).min(1, 'Assign at least one branch.'),
})

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
  } = useForm<StaffInput>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          fullName: initial.fullName,
          username: initial.username,
          email: initial.email,
          role: initial.role,
          branchIds: initial.branchIds,
        }
      : { fullName: '', username: '', email: '', role: roles.find((r) => r.id !== 'owner')?.id ?? roles[0]?.id ?? '', branchIds: [] },
  })

  const selectedBranchIds = watch('branchIds')
  const selectedRole = watch('role')

  const toggleBranch = (id: string) => {
    const next = selectedBranchIds.includes(id)
      ? selectedBranchIds.filter((b) => b !== id)
      : [...selectedBranchIds, id]
    setValue('branchIds', next, { shouldValidate: true, shouldDirty: true })
  }

  return (
    <Modal title={initial ? 'Edit staff member' : 'Add staff member'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Full name" {...register('fullName')} error={errors.fullName?.message} />
        <FormField label="Username" {...register('username')} error={errors.username?.message} />
        <FormField label="Email" type="email" {...register('email')} error={errors.email?.message} />

        <RoleQuickSelect
          id="role"
          roles={roles}
          value={selectedRole}
          onChange={(roleId) => setValue('role', roleId, { shouldValidate: true, shouldDirty: true })}
          userId={userId}
          error={errors.role?.message}
        />

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
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
