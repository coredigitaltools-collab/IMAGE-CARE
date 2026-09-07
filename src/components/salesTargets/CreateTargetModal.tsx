import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { BranchFormModal } from '../settings/BranchFormModal'
import { useCreateBranch } from '../../features/settings/hooks/useSettingsData'
import { TARGET_SCOPE_LABELS } from '../../types/salesTargets'
import type { SalesTarget, SalesTargetInput, TargetScope } from '../../types/salesTargets'
import type { BranchRecord, StaffMember } from '../../types/settings'

interface CreateTargetModalProps {
  branches: BranchRecord[]
  staff: StaffMember[]
  userId: string
  onClose: () => void
  onSubmit: (input: SalesTargetInput) => Promise<void>
  submitError?: string
  // Feature request (2026-09-07): "i want to be able to edit a target."
  // When set, this modal opens pre-filled for that target and submits an
  // update instead of a create (TargetsListPage.tsx decides which, based
  // on whether this is passed) - who a target is FOR is shown read-only
  // rather than as editable selects, since changing scope/branch/staff
  // after creation isn't supported (see updateTarget() in
  // services/salesTargets/salesTargetsService.ts for why).
  editingTarget?: SalesTarget
}

const SCOPES: TargetScope[] = ['business', 'branch', 'staff']

export function CreateTargetModal({ branches, staff, userId, onClose, onSubmit, submitError, editingTarget }: CreateTargetModalProps) {
  const isEditing = Boolean(editingTarget)
  const createBranch = useCreateBranch(userId)
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [scope, setScope] = useState<TargetScope>(editingTarget?.scope ?? 'business')
  const [branchId, setBranchId] = useState(editingTarget?.branchId ?? branches[0]?.id ?? '')
  const [staffId, setStaffId] = useState(editingTarget?.staffId ?? staff[0]?.id ?? '')
  const [periodStart, setPeriodStart] = useState(editingTarget?.periodStart ?? firstOfMonth)
  const [periodEnd, setPeriodEnd] = useState(editingTarget?.periodEnd ?? lastOfMonth)
  const [targetAmount, setTargetAmount] = useState(editingTarget?.targetAmountUgx ?? 0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 2026-08-31: "No branches yet" used to be a dead end here - picking a
  // branch scope with zero branches meant leaving this modal to go create
  // one elsewhere. Now it can be created inline, without losing the rest
  // of the target form already filled in.
  const [isAddingBranch, setIsAddingBranch] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit({
        scope,
        branchId: scope === 'branch' ? branchId : null,
        staffId: scope === 'staff' ? staffId : null,
        periodStart,
        periodEnd,
        targetAmountUgx: targetAmount,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAddingBranch) {
    return (
      <BranchFormModal
        onClose={() => setIsAddingBranch(false)}
        onSubmit={async (input) => {
          const created = await createBranch.mutateAsync(input)
          setBranchId(created.id)
          setIsAddingBranch(false)
        }}
      />
    )
  }

  return (
    <Modal title={isEditing ? 'Edit target' : 'New sales target'} onClose={onClose}>
      <div className="space-y-4">
        {isEditing ? (
          <div>
            <p className="mb-1.5 block text-sm font-medium text-ink-700">Who this target is for</p>
            <p className="rounded-md border border-ink-100 bg-ink-50 px-3 py-2 text-sm text-ink-700">
              {scope === 'business'
                ? 'Business-wide'
                : scope === 'branch'
                  ? (branches.find((b) => b.id === branchId)?.name ?? 'Unknown branch')
                  : (staff.find((s) => s.id === staffId)?.fullName ?? 'Unknown staff')}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Who a target is for can&apos;t be changed after it&apos;s created - delete this one and create a new target instead if that needs to change.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="tg-scope" className="mb-1.5 block text-sm font-medium text-ink-700">
              Who is this target for?
            </label>
            <select
              id="tg-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as TargetScope)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {TARGET_SCOPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isEditing && scope === 'branch' && (
          <div>
            <label htmlFor="tg-branch" className="mb-1.5 block text-sm font-medium text-ink-700">
              Branch
            </label>
            <div className="flex gap-2">
              <select
                id="tg-branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
              >
                {branches.length === 0 && <option value="">No branches yet</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setIsAddingBranch(true)}
                className="shrink-0 rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
              >
                + New
              </button>
            </div>
          </div>
        )}

        {!isEditing && scope === 'staff' && (
          <div>
            <label htmlFor="tg-staff" className="mb-1.5 block text-sm font-medium text-ink-700">
              Staff member
            </label>
            <select
              id="tg-staff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {staff.length === 0 && <option value="">No staff yet</option>}
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-500">
              Progress counts sales where this person was picked as "Sold by" at checkout.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tg-start" className="mb-1.5 block text-sm font-medium text-ink-700">
              Period start
            </label>
            <input
              id="tg-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
          <div>
            <label htmlFor="tg-end" className="mb-1.5 block text-sm font-medium text-ink-700">
              Period end
            </label>
            <input
              id="tg-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
        </div>

        <NumberField id="tg-amount" label="Target amount (UGX)" min={0} value={targetAmount} onChange={setTargetAmount} />

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || targetAmount <= 0}>
            {isEditing ? (isSubmitting ? 'Saving…' : 'Save changes') : isSubmitting ? 'Creating...' : 'Create target'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
