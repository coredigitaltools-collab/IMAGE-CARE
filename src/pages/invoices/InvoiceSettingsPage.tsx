import { useEffect, useState } from 'react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { InvoiceTabs } from '../../components/invoices/InvoiceTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/settings/FormField'
import { ToggleRow } from '../../components/settings/ToggleRow'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useInvoiceSettings, useSaveInvoiceSettings } from '../../features/invoices/hooks/useInvoicesData'

export function InvoiceSettingsPage() {
  const { showToast } = useToast()
  const settingsQuery = useInvoiceSettings()
  const saveSettings = useSaveInvoiceSettings()

  const [defaultDueDays, setDefaultDueDays] = useState(14)
  const [footerText, setFooterText] = useState('')
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(true)
  const [showLogo, setShowLogo] = useState(true)

  useEffect(() => {
    if (settingsQuery.data) {
      setDefaultDueDays(settingsQuery.data.defaultDueDays)
      setFooterText(settingsQuery.data.footerText)
      setShowTaxBreakdown(settingsQuery.data.showTaxBreakdown)
      setShowLogo(settingsQuery.data.showLogo)
    }
  }, [settingsQuery.data])

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Invoices' }]} />
      <InvoiceTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Invoice Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">Template and defaults for every invoice generated.</p>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card className="space-y-1 p-5">
          <FormField
            id="is-due-days"
            label="Default days until due"
            type="number"
            min={0}
            value={defaultDueDays}
            onChange={(e) => setDefaultDueDays(Number(e.target.value))}
          />
          <div className="py-3">
            <label htmlFor="is-footer" className="mb-1.5 block text-sm font-medium text-ink-700">
              Footer text
            </label>
            <textarea
              id="is-footer"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
          <ToggleRow label="Show tax breakdown" checked={showTaxBreakdown} onChange={setShowTaxBreakdown} />
          <ToggleRow label="Show business name on invoice" checked={showLogo} onChange={setShowLogo} />

          <div className="flex justify-end pt-3">
            <Button
              onClick={async () => {
                await saveSettings.mutateAsync({ defaultDueDays, footerText, showTaxBreakdown, showLogo })
                showToast('Invoice settings saved.', 'success')
              }}
            >
              Save settings
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
