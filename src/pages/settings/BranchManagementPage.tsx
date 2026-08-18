import { useState } from 'react'
import { Plus } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { BranchFormModal } from '../../components/settings/BranchFormModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import {
  useBranches,
  useCreateBranch,
  useSetBranchActive,
  useUpdateBranch,
} from '../../features/settings/hooks/useSettingsData'
import type { BranchInput, BranchRecord } from '../../types/settings'
import { DuplicateBranchCodeError } from '../../services/branchService'

export function BranchManagementPage() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const branchesQuery = useBranches()
  const createBranch = useCreateBranch(user.id)
  const updateBranch = useUpdateBranch(user.id)
  const setBranchActive = useSetBranchActive(user.id)

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; branch: BranchRecord } | null>(null)
  const [formError, setFormError] = useState<string | undefined>()

  const handleSubmit = async (input: BranchInput) => {
    setFormError(undefined)
    try {
      if (modalState?.mode === 'edit') {
        await updateBranch.mutateAsync({ id: modalState.branch.id, input })
        showToast('Branch updated.', 'success')
      } else {
        await createBranch.mutateAsync(input)
        showToast('Branch added.', 'success')
      }
      setModalState(null)
    } catch (err) {
      setFormError(err instanceof DuplicateBranchCodeError ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsPageHeader
        title="Branch Management"
        description="Locations, branch codes, and contact details."
        action={
          <Button onClick={() => setModalState({ mode: 'create' })}>
            <Plus size={15} /> Add branch
          </Button>
        }
      />

      <Card className="p-5">
        {branchesQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {(branchesQuery.data ?? []).map((branch) => (
              <li key={branch.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">{branch.name}</p>
                    <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-500">
                      {branch.code}
                    </span>
                    {!branch.is_active && (
                      <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-500">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500">
                    {branch.address}
                    {branch.phone ? ` · ${branch.phone}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => setModalState({ mode: 'edit', branch })}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setBranchActive.mutate({ id: branch.id, isActive: !branch.is_active })}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                  >
                    {branch.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modalState && (
        <BranchFormModal
          initial={modalState.mode === 'edit' ? modalState.branch : undefined}
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
