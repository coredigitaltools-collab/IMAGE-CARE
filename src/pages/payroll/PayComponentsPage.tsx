import { useState } from 'react'
import { Archive, Plus, SlidersHorizontal } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PayrollTabs } from '../../components/payroll/PayrollTabs'
import { PayComponentTypeFormModal } from '../../components/payroll/PayComponentTypeFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useArchiveComponentType, useComponentTypes, useCreateComponentType } from '../../features/payroll/hooks/usePayrollData'

function ComponentList({ kind, title }: { kind: 'allowance' | 'deduction'; title: string }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const typesQuery = useComponentTypes(kind)
  const createType = useCreateComponentType(user.id)
  const archiveType = useArchiveComponentType(user.id)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const activeTypes = (typesQuery.data ?? []).filter((t) => t.is_active)

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <Button variant="secondary" onClick={() => setIsAddOpen(true)}>
          <Plus size={14} /> New
        </Button>
      </div>
      {typesQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : activeTypes.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title={`No ${kind}s yet`} description={`Define your own ${kind} types, nothing preset.`} />
      ) : (
        <ul className="divide-y divide-ink-100">
          {activeTypes.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="font-medium text-ink-900">{t.name}</p>
                <p className="text-xs text-ink-500">{t.isPercentageOfBase ? `${t.amount}% of base salary` : `UGX ${t.amount.toLocaleString()}`}</p>
              </div>
              <RowActionButton
                icon={Archive}
                label="Archive"
                tone="danger"
                onClick={async () => {
                  await archiveType.mutateAsync(t.id)
                  showToast(`${kind === 'allowance' ? 'Allowance' : 'Deduction'} archived.`, 'success')
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {isAddOpen && (
        <PayComponentTypeFormModal
          kind={kind}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createType.mutateAsync({ kind, input })
            showToast(`${kind === 'allowance' ? 'Allowance' : 'Deduction'} created.`, 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </Card>
  )
}

export function PayComponentsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Payroll' }]} />
      <PayrollTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Allowances & Deductions</h1>
        <p className="mt-0.5 text-sm text-ink-500">Your own pay components, fixed amounts or a percentage of base salary.</p>
      </div>

      <div className="space-y-4">
        <ComponentList kind="allowance" title="Allowances" />
        <ComponentList kind="deduction" title="Deductions" />
      </div>
    </div>
  )
}
