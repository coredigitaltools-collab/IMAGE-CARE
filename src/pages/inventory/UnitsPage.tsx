import { useState } from 'react'
import { Plus } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { UnitFormModal } from '../../components/inventory/UnitFormModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useArchiveUnit, useCreateUnit, useUnits, useUpdateUnit } from '../../features/inventory/hooks/useInventoryData'
import type { UnitInput, UnitOfMeasure } from '../../types/inventory'

export function UnitsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const unitsQuery = useUnits()
  const createUnit = useCreateUnit(user.id)
  const updateUnit = useUpdateUnit(user.id)
  const archiveUnit = useArchiveUnit(user.id)

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; unit: UnitOfMeasure } | null>(null)

  const handleSubmit = async (input: UnitInput) => {
    if (modalState?.mode === 'edit') {
      await updateUnit.mutateAsync({ id: modalState.unit.id, input })
      showToast('Unit updated.', 'success')
    } else {
      await createUnit.mutateAsync(input)
      showToast('Unit added.', 'success')
    }
    setModalState(null)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <InventoryTabs />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Units of Measure</h1>
          <p className="mt-0.5 text-sm text-ink-500">Configure units used across the product catalogue.</p>
        </div>
        <Button onClick={() => setModalState({ mode: 'create' })}>
          <Plus size={15} /> Add unit
        </Button>
      </div>

      <Card className="p-5">
        {unitsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(unitsQuery.data ?? [])
              .filter((u) => u.is_active)
              .map((unit) => (
                <li key={unit.id} className="flex items-center justify-between py-3">
                  <p className="text-sm font-medium text-ink-900">
                    {unit.name} <span className="text-ink-500">({unit.abbreviation})</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setModalState({ mode: 'edit', unit })}
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        await archiveUnit.mutateAsync(unit.id)
                        showToast('Unit archived.', 'success')
                      }}
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-red-700 hover:bg-brand-red-50"
                    >
                      Archive
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {modalState && (
        <UnitFormModal
          initial={modalState.mode === 'edit' ? modalState.unit : undefined}
          onClose={() => setModalState(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
