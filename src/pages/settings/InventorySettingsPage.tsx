import { useEffect, useState } from 'react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ToggleRow } from '../../components/settings/ToggleRow'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useInventorySettings, useSaveInventorySettings } from '../../features/settings/hooks/useSettingsData'

export function InventorySettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = useInventorySettings()
  const save = useSaveInventorySettings(user.id)

  const [defaultReorderLevel, setDefaultReorderLevel] = useState(10)
  const [skuPrefix, setSkuPrefix] = useState('SKU')
  const [trackExpiryDates, setTrackExpiryDates] = useState(false)

  useEffect(() => {
    if (!query.data) return
    setDefaultReorderLevel(query.data.defaultReorderLevel)
    setSkuPrefix(query.data.skuPrefix)
    setTrackExpiryDates(query.data.trackExpiryDates)
  }, [query.data])

  const handleSave = async () => {
    await save.mutateAsync({ defaultReorderLevel, skuPrefix, trackExpiryDates })
    showToast('Inventory settings saved.', 'success')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="Inventory Settings" description="Defaults applied when items are added to inventory." />
      <Card className="p-5">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            <FormField
              id="inv-reorder-level"
              label="Default reorder level"
              type="number"
              min={0}
              value={defaultReorderLevel}
              onChange={(e) => setDefaultReorderLevel(Number(e.target.value))}
              hint="New items default to this low-stock threshold."
            />
            <FormField id="inv-sku-prefix" label="SKU prefix" value={skuPrefix} onChange={(e) => setSkuPrefix(e.target.value)} />
            <ToggleRow
              label="Track expiry dates"
              description="Enable expiry tracking on inventory items"
              checked={trackExpiryDates}
              onChange={setTrackExpiryDates}
            />
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
