import { useState } from 'react'
import { Plus, GitMerge } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { CategoryFormModal, MergeCategoryModal } from '../../components/inventory/CategoryFormModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useMergeCategories,
  useUpdateCategory,
} from '../../features/inventory/hooks/useInventoryData'
import type { Category, CategoryInput } from '../../types/inventory'

export function CategoriesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const categoriesQuery = useCategories()
  const createCategory = useCreateCategory(user.id)
  const updateCategory = useUpdateCategory(user.id)
  const archiveCategory = useArchiveCategory(user.id)
  const mergeCategories = useMergeCategories(user.id)

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; category: Category } | null>(null)
  const [mergeSource, setMergeSource] = useState<Category | null>(null)

  const handleSubmit = async (input: CategoryInput) => {
    if (modalState?.mode === 'edit') {
      await updateCategory.mutateAsync({ id: modalState.category.id, input })
      showToast('Category updated.', 'success')
    } else {
      await createCategory.mutateAsync(input)
      showToast('Category added.', 'success')
    }
    setModalState(null)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <InventoryTabs />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Categories</h1>
          <p className="mt-0.5 text-sm text-ink-500">Organize products into categories.</p>
        </div>
        <Button onClick={() => setModalState({ mode: 'create' })}>
          <Plus size={15} /> Add category
        </Button>
      </div>

      <Card className="p-5">
        {categoriesQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(categoriesQuery.data ?? [])
              .filter((c) => c.is_active)
              .map((category) => (
                <li key={category.id} className="flex items-center justify-between py-3">
                  <p className="text-sm font-medium text-ink-900">{category.name}</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setMergeSource(category)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                    >
                      <GitMerge size={12} /> Merge
                    </button>
                    <button
                      onClick={() => setModalState({ mode: 'edit', category })}
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        await archiveCategory.mutateAsync(category.id)
                        showToast('Category archived.', 'success')
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
        <CategoryFormModal
          initial={modalState.mode === 'edit' ? modalState.category : undefined}
          onClose={() => setModalState(null)}
          onSubmit={handleSubmit}
        />
      )}

      {mergeSource && (
        <MergeCategoryModal
          categories={(categoriesQuery.data ?? []).filter((c) => c.is_active)}
          source={mergeSource}
          onClose={() => setMergeSource(null)}
          onMerge={async (targetId) => {
            await mergeCategories.mutateAsync({ sourceId: mergeSource.id, targetId })
            showToast(`Merged into ${(categoriesQuery.data ?? []).find((c) => c.id === targetId)?.name}.`, 'success')
            setMergeSource(null)
          }}
        />
      )}
    </div>
  )
}
