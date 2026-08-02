import { useState } from 'react'
import { Archive, Plus, RotateCcw, Repeat } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { RecurringTemplateFormModal } from '../../components/expenses/RecurringTemplateFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import {
  useArchiveRecurringTemplate,
  useCreateRecurringTemplate,
  useExpenseCategories,
  useGenerateDueRecurringExpenses,
  useRecurringTemplates,
} from '../../features/expenses/hooks/useExpensesData'
import { RECURRING_FREQUENCY_LABELS } from '../../types/expenses'

export function RecurringExpensesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const templatesQuery = useRecurringTemplates()
  const categoriesQuery = useExpenseCategories()
  const createTemplate = useCreateRecurringTemplate(user.id)
  const archiveTemplate = useArchiveRecurringTemplate(user.id)
  const generateDue = useGenerateDueRecurringExpenses(user.id)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.is_active)
  const activeTemplates = (templatesQuery.data ?? []).filter((t) => t.is_active)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Recurring Expenses</h1>
          <p className="mt-0.5 text-sm text-ink-500">Rent, subscriptions, anything that repeats on a schedule.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New template
        </Button>
      </div>

      <Card className="mb-4 p-5">
        <h2 className="mb-2 text-sm font-semibold text-ink-900">Generate due expenses</h2>
        <p className="mb-3 text-xs text-ink-500">
          There's no background job in this offline-first app, generating due recurring expenses is a deliberate, logged action you run when you
          want it.
        </p>
        <Button
          variant="secondary"
          onClick={async () => {
            const result = await generateDue.mutateAsync()
            if (result.generated === 0) showToast('No recurring expenses are due yet.')
            else showToast(`Generated ${result.generated} expense(s) as drafts.`, 'success')
          }}
        >
          <RotateCcw size={14} /> Generate due expenses
        </Button>
      </Card>

      <Card className="p-5">
        {templatesQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : activeTemplates.length === 0 ? (
          <EmptyState icon={Repeat} title="No recurring expenses yet" description="Set up a template for anything that repeats." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {activeTemplates.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink-900">
                    {t.categoryName} · {t.description}
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatCurrency(t.amount, 'UGX')} · {RECURRING_FREQUENCY_LABELS[t.frequency]} · next due{' '}
                    {new Date(t.nextDueDate).toLocaleDateString('en-UG')}
                  </p>
                </div>
                <RowActionButton
                  icon={Archive}
                  label="Archive"
                  tone="danger"
                  onClick={async () => {
                    await archiveTemplate.mutateAsync(t.id)
                    showToast('Template archived.', 'success')
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <RecurringTemplateFormModal
          categories={activeCategories}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createTemplate.mutateAsync(input)
            showToast('Recurring expense template created.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
