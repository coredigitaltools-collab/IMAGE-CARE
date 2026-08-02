import { Link } from 'react-router-dom'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BillsTabs } from '../../components/bills/BillsTabs'
import { Card } from '../../components/ui/Card'
import { STANDARD_PAYMENT_TERMS_DAYS } from '../../services/billsService'

export function BillsSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bills & Payables' }]} />
      <BillsTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Bills Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">How bills are recorded and tracked.</p>
      </div>

      <Card className="p-5">
        <p className="text-xs text-ink-500">Aging reference period</p>
        <p className="mt-1 text-sm text-ink-900">{STANDARD_PAYMENT_TERMS_DAYS} days is used as the "current" boundary in Aging & Reports.</p>
      </Card>

      <Card className="mt-4 p-5">
        <p className="text-sm text-ink-700">
          Bills are recorded as Supplier Invoices under{' '}
          <Link to="/purchasing/invoices" className="text-brand-blue-700 hover:underline">
            Purchasing → Invoices
          </Link>{' '}
         , due dates and payment terms are set there, at the point a bill is created. This module tracks what's owed and manages payment,
          cancellation, and closing from the Finance side.
        </p>
      </Card>
    </div>
  )
}
