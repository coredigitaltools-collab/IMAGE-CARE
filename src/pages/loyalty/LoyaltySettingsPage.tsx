import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { LoyaltyTabs } from '../../components/loyalty/LoyaltyTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useLoyaltySettings, useProcessExpirations, useSaveLoyaltySettings } from '../../features/loyalty/hooks/useLoyaltyData'

export function LoyaltySettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const settingsQuery = useLoyaltySettings()
  const saveSettings = useSaveLoyaltySettings()
  const processExpirations = useProcessExpirations(user.id)

  const [ugxPerPoint, setUgxPerPoint] = useState(1000)
  const [redemptionValuePerPointUgx, setRedemptionValuePerPointUgx] = useState(100)
  const [minPointsToRedeem, setMinPointsToRedeem] = useState(0)
  const [expiryDays, setExpiryDays] = useState(0)

  useEffect(() => {
    if (settingsQuery.data) {
      setUgxPerPoint(settingsQuery.data.ugxPerPoint)
      setRedemptionValuePerPointUgx(settingsQuery.data.redemptionValuePerPointUgx)
      setMinPointsToRedeem(settingsQuery.data.minPointsToRedeem)
      setExpiryDays(settingsQuery.data.expiryDays)
    }
  }, [settingsQuery.data])

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Loyalty' }]} />
      <LoyaltyTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Loyalty Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">The Points Engine, how points are earned, redeemed, and expired.</p>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <Card className="space-y-4 p-5">
          <FormField
            id="ls-earn-rate"
            label="UGX spent per point earned"
            type="number"
            min={1}
            value={ugxPerPoint}
            onChange={(e) => setUgxPerPoint(Number(e.target.value))}
            hint="e.g. 1000 means a customer earns 1 point for every 1,000 UGX spent."
          />
          <FormField
            id="ls-redeem-value"
            label="Cash value per point when redeemed (UGX)"
            type="number"
            min={0}
            value={redemptionValuePerPointUgx}
            onChange={(e) => setRedemptionValuePerPointUgx(Number(e.target.value))}
          />
          <FormField
            id="ls-min-redeem"
            label="Minimum points required to redeem"
            type="number"
            min={0}
            value={minPointsToRedeem}
            onChange={(e) => setMinPointsToRedeem(Number(e.target.value))}
          />
          <FormField
            id="ls-expiry"
            label="Points expire after this many days of no activity (0 = never)"
            type="number"
            min={0}
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
          />

          <div className="flex justify-end pt-2">
            <Button
              onClick={async () => {
                await saveSettings.mutateAsync({ ugxPerPoint, redemptionValuePerPointUgx, minPointsToRedeem, expiryDays })
                showToast('Loyalty settings saved.', 'success')
              }}
            >
              Save settings
            </Button>
          </div>
        </Card>
      )}

      <Card className="mt-4 p-5">
        <h2 className="mb-2 text-sm font-semibold text-ink-900">Process expirations</h2>
        <p className="mb-3 text-xs text-ink-500">
          There's no background job in this offline-first app, expiring points is a deliberate, logged action you run when you want it, never
          silent.
        </p>
        <Button
          variant="secondary"
          onClick={async () => {
            const result = await processExpirations.mutateAsync()
            if (result.customersAffected === 0) {
              showToast('No points were eligible to expire.')
            } else {
              showToast(`Expired ${result.pointsExpired} points across ${result.customersAffected} customer(s).`, 'success')
            }
          }}
        >
          <RotateCcw size={14} /> Run expiration now
        </Button>
      </Card>
    </div>
  )
}
