import { useEffect, useState } from 'react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ToggleRow } from '../../components/settings/ToggleRow'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useReceiptSettings, useSaveReceiptSettings } from '../../features/settings/hooks/useSettingsData'

export function ReceiptSettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = useReceiptSettings()
  const save = useSaveReceiptSettings(user.id)

  const [footerMessage, setFooterMessage] = useState('')
  const [showLogo, setShowLogo] = useState(true)
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(true)
  const [showCashierName, setShowCashierName] = useState(true)

  useEffect(() => {
    if (!query.data) return
    setFooterMessage(query.data.footerMessage)
    setShowLogo(query.data.showLogo)
    setShowTaxBreakdown(query.data.showTaxBreakdown)
    setShowCashierName(query.data.showCashierName)
  }, [query.data])

  const handleSave = async () => {
    await save.mutateAsync({ footerMessage, showLogo, showTaxBreakdown, showCashierName })
    showToast('Receipt settings saved.', 'success')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="Receipt Settings" description="Controls what appears on printed and emailed receipts." />
      <Card className="p-5">
        {query.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-1 divide-y divide-ink-100">
            <div className="pb-4">
              <label htmlFor="footerMessage" className="mb-1.5 block text-sm font-medium text-ink-700">
                Footer message
              </label>
              <input
                id="footerMessage"
                value={footerMessage}
                onChange={(e) => setFooterMessage(e.target.value)}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
              />
            </div>
            <ToggleRow label="Show business logo" checked={showLogo} onChange={setShowLogo} />
            <ToggleRow label="Show tax breakdown" checked={showTaxBreakdown} onChange={setShowTaxBreakdown} />
            <ToggleRow label="Show cashier name" checked={showCashierName} onChange={setShowCashierName} />
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
