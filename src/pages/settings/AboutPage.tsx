import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { useBusinessProfile } from '../../features/settings/hooks/useSettingsData'

const IMPLEMENTED = [
  'Dashboard (IMP-001)', 'Settings (IMP-002)', 'Inventory (IMP-003)', 'Sales & POS (IMP-004)',
  'CRM (IMP-005)', 'Credit Management (IMC-SRS-006)', 'Purchasing & Procurement (IMC-SRS-007)',
  'Loyalty Programme (IMC-SRS-008)', 'Invoices (IMC-SRS-009)', 'Bills & Payables (IMC-SRS-010)',
  'Payroll (IMC-SRS-011)', 'Expenses (IMC-SRS-012)', 'Sales Targets (IMC-SRS-013)', 'Stock Summary (IMC-SRS-014)',
  'Cash Flow (IMC-SRS-015)', 'Monthly Summary (IMC-SRS-016)', 'Annual Summary (IMC-SRS-017)', 'Daily Summary (IMC-SRS-018)',
  'Bank Reconciliation (IMC-SRS-019)', 'Branch Overview (IMC-SRS-020)', 'Offline Mode (IMC-SRS-021)',
]
const PLANNED: string[] = []

export function AboutPage() {
  const businessProfileQuery = useBusinessProfile()
  const businessName = businessProfileQuery.data?.businessName ?? 'Your Business'

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="About" description="App version and module status." />

      <Card className="p-5">
        <p className="text-sm font-semibold text-ink-900">{businessName} Business Management System</p>
        <p className="mt-1 text-xs text-ink-500">Progressive Web App · Built with React, Vite, and Supabase</p>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Implemented modules</h2>
        <div className="flex flex-wrap gap-2">
          {IMPLEMENTED.map((m) => (
            <Badge key={m} tone="success">
              {m}
            </Badge>
          ))}
        </div>
      </Card>

      {PLANNED.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Planned modules</h2>
          <div className="flex flex-wrap gap-2">
            {PLANNED.map((m) => (
              <Badge key={m} tone="neutral">
                {m}
              </Badge>
            ))}
          </div>
        </Card>
      )}
      {PLANNED.length === 0 && (
        <Card className="mt-6 p-5">
          <p className="text-sm text-ink-700">Every module in the original specification is implemented. No modules are currently planned.</p>
        </Card>
      )}
    </div>
  )
}
