import { useEffect, useState } from 'react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ToggleRow } from '../../components/settings/ToggleRow'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useSalesSettings, useSaveSalesSettings } from '../../features/settings/hooks/useSettingsData'

export function SalesSettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = useSalesSettings()
  const save = useSaveSalesSettings(user.id)

  const [allowDiscounts, setAllowDiscounts] = useState(true)
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(15)
  const [requireCustomerForCredit, setRequireCustomerForCredit] = useState(true)

  useEffect(() => {
    if (!query.data) return
    setAllowDiscounts(query.data.allowDiscounts)
    setMaxDiscountPercent(query.data.maxDiscountPercent)
    setRequireCustomerForCredit(query.data.requireCustomerForCredit)
  }, [query.data])

  const handleSave = async () => {
    await save.mutateAsync({ allowDiscounts, maxDiscountPercent, requireCustomerForCredit })
    showToast('Sales settings saved.', 'success')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="Sales Settings" description="Discount limits and credit sale rules." />
      <Card className="p-5">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-1 divide-y divide-ink-100">
            <div className="pb-4">
              <ToggleRow label="Allow discounts on sales" checked={allowDiscounts} onChange={setAllowDiscounts} />
            </div>
            {allowDiscounts && (
              <div className="py-4">
                <FormField
                  label="Maximum discount (%)"
                  type="number"
                  min={0}
                  max={100}
                  value={maxDiscountPercent}
                  onChange={(e) => setMaxDiscountPercent(Number(e.target.value))}
                />
              </div>
            )}
            <div className="pt-4">
              <ToggleRow
                label="Require a customer for credit sales"
                description="Blocks walk-in credit sales without a linked client"
                checked={requireCustomerForCredit}
                onChange={setRequireCustomerForCredit}
              />
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={query.isLoading || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
