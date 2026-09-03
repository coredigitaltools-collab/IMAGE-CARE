import { useState } from 'react'
import { Plus } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { SupplierFormModal } from '../../components/inventory/SupplierFormModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useArchiveSupplier, useCreateSupplier, useSuppliers, useUpdateSupplier } from '../../features/inventory/hooks/useInventoryData'
import type { Supplier, SupplierInput } from '../../types/inventory'

export function SuppliersPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const suppliersQuery = useSuppliers()
  const createSupplier = useCreateSupplier(user.id)
  const updateSupplier = useUpdateSupplier(user.id)
  const archiveSupplier = useArchiveSupplier(user.id)

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; supplier: Supplier } | null>(null)

  const handleSubmit = async (input: SupplierInput) => {
    // Same missing-handler problem as the inline add on Supplier Invoices:
    // a rejected save was an unhandled promise rejection with no feedback.
    try {
      if (modalState?.mode === 'edit') {
        await updateSupplier.mutateAsync({ id: modalState.supplier.id, input })
        showToast('Supplier updated.', 'success')
      } else {
        await createSupplier.mutateAsync(input)
        showToast('Supplier added.', 'success')
      }
      setModalState(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save this supplier.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryTabs />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Suppliers</h1>
          <p className="mt-0.5 text-sm text-ink-500">Supplier contacts and details.</p>
        </div>
        <Button onClick={() => setModalState({ mode: 'create' })}>
          <Plus size={15} /> Add supplier
        </Button>
      </div>

      <Card className="p-5">
        {suppliersQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(suppliersQuery.data ?? []).map((supplier) => (
              <li key={supplier.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">{supplier.name}</p>
                    <Badge tone={supplier.status === 'active' ? 'success' : 'neutral'}>{supplier.status}</Badge>
                  </div>
                  <p className="text-xs text-ink-500">
                    {supplier.contactName} · {supplier.phone} · {supplier.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => setModalState({ mode: 'edit', supplier })}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      await archiveSupplier.mutateAsync(supplier.id)
                      showToast('Supplier marked inactive.', 'success')
                    }}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-red-700 hover:bg-brand-red-50"
                  >
                    Deactivate
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modalState && (
        <SupplierFormModal
          initial={modalState.mode === 'edit' ? modalState.supplier : undefined}
          onClose={() => setModalState(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
