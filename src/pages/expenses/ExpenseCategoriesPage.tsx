import { useState } from 'react'
import { Archive, Plus, Tag } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { CategoryFormModal } from '../../components/expenses/CategoryFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useArchiveExpenseCategory, useCreateExpenseCategory, useExpenseCategories } from '../../features/expenses/hooks/useExpensesData'

export function ExpenseCategoriesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const categoriesQuery = useExpenseCategories()
  const createCategory = useCreateExpenseCategory(user.id)
  const archiveCategory = useArchiveExpenseCategory(user.id)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.is_active)

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expense Categories</h1>
          <p className="mt-0.5 text-sm text-ink-500">Entirely your own, nothing preset.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New category
        </Button>
      </div>

      <Card className="p-5">
        {categoriesQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : activeCategories.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No categories yet"
            description="Add categories like Rent, Utilities, or Supplies."
            action={{ label: 'New category', onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {activeCategories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-ink-900">{c.name}</span>
                <RowActionButton
                  icon={Archive}
                  label="Archive"
                  tone="danger"
                  onClick={async () => {
                    await archiveCategory.mutateAsync(c.id)
                    showToast('Category archived.', 'success')
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <CategoryFormModal
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (name) => {
            await createCategory.mutateAsync({ name })
            showToast('Category created.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
