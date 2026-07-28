import { useState } from 'react'
import { Plus } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { BrandFormModal } from '../../components/inventory/BrandFormModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useArchiveBrand, useBrands, useCreateBrand, useUpdateBrand } from '../../features/inventory/hooks/useInventoryData'
import type { Brand, BrandInput } from '../../types/inventory'

export function BrandsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const brandsQuery = useBrands()
  const createBrand = useCreateBrand(user.id)
  const updateBrand = useUpdateBrand(user.id)
  const archiveBrand = useArchiveBrand(user.id)

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; brand: Brand } | null>(null)

  const handleSubmit = async (input: BrandInput) => {
    if (modalState?.mode === 'edit') {
      await updateBrand.mutateAsync({ id: modalState.brand.id, input })
      showToast('Brand updated.', 'success')
    } else {
      await createBrand.mutateAsync(input)
      showToast('Brand added.', 'success')
    }
    setModalState(null)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <InventoryTabs />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Brands</h1>
          <p className="mt-0.5 text-sm text-ink-500">Manage product brands.</p>
        </div>
        <Button onClick={() => setModalState({ mode: 'create' })}>
          <Plus size={15} /> Add brand
        </Button>
      </div>

      <Card className="p-5">
        {brandsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(brandsQuery.data ?? [])
              .filter((b) => b.is_active)
              .map((brand) => (
                <li key={brand.id} className="flex items-center justify-between py-3">
                  <p className="text-sm font-medium text-ink-900">{brand.name}</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setModalState({ mode: 'edit', brand })}
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        await archiveBrand.mutateAsync(brand.id)
                        showToast('Brand archived.', 'success')
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
        <BrandFormModal
          initial={modalState.mode === 'edit' ? modalState.brand : undefined}
          onClose={() => setModalState(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
