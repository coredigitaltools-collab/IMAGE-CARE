import { useState } from 'react'
import { Plus } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { TaxRateFormModal } from '../../components/settings/TaxRateFormModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useCreateTaxRate, useTaxRates, useUpdateTaxRate } from '../../features/settings/hooks/useSettingsData'
import type { TaxRate, TaxRateInput } from '../../types/settings'

export function TaxSettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const taxRatesQuery = useTaxRates()
  const createTaxRate = useCreateTaxRate(user.id)
  const updateTaxRate = useUpdateTaxRate(user.id)

  const [modalState, setModalState] = useState<{ mode: 'create' } | { mode: 'edit'; rate: TaxRate } | null>(null)

  const handleSubmit = async (input: TaxRateInput) => {
    if (modalState?.mode === 'edit') {
      await updateTaxRate.mutateAsync({ id: modalState.rate.id, input })
      showToast('Tax rate updated.', 'success')
    } else {
      await createTaxRate.mutateAsync(input)
      showToast('Tax rate added.', 'success')
    }
    setModalState(null)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader
        title="Tax Settings"
        description="Tax rates available for sales and invoices."
        action={
          <Button onClick={() => setModalState({ mode: 'create' })}>
            <Plus size={15} /> Add tax rate
          </Button>
        }
      />

      <Card className="p-5">
        {taxRatesQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(taxRatesQuery.data ?? []).map((rate) => (
              <li key={rate.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">{rate.name}</p>
                    {rate.isDefault && <Badge tone="info">Default</Badge>}
                  </div>
                  <p className="text-xs text-ink-500">
                    {rate.ratePercent}% · {rate.isInclusive ? 'Tax-inclusive' : 'Tax-exclusive'}
                  </p>
                </div>
                <button
                  onClick={() => setModalState({ mode: 'edit', rate })}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modalState && (
        <TaxRateFormModal
          initial={modalState.mode === 'edit' ? modalState.rate : undefined}
          onClose={() => setModalState(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
