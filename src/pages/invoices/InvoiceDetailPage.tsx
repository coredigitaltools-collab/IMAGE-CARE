import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, FileText, Printer, Send, XCircle } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useBusinessProfile } from '../../features/settings/hooks/useSettingsData'
import { useCancelInvoice, useInvoice, useInvoiceSettings, useMarkInvoicePaid, useMarkInvoiceSent } from '../../features/invoices/hooks/useInvoicesData'
import { InvalidInvoiceTransitionError, effectiveStatus } from '../../services/invoiceService'
import { INVOICE_STATUS_LABELS } from '../../types/invoices'

const STATUS_TONE = { unpaid: 'warning', partially_paid: 'warning', paid: 'success', overdue: 'danger', cancelled: 'neutral' } as const

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { showToast } = useToast()

  const invoiceQuery = useInvoice(id)
  const settingsQuery = useInvoiceSettings()
  const businessProfileQuery = useBusinessProfile()
  const markSent = useMarkInvoiceSent()
  const markPaid = useMarkInvoicePaid()
  const cancelInvoice = useCancelInvoice()

  const [actionError, setActionError] = useState<string | undefined>()

  const invoice = invoiceQuery.data

  if (invoiceQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={FileText} title="Invoice not found" description="It may have been removed." />
      </div>
    )
  }

  const status = effectiveStatus(invoice)
  const settings = settingsQuery.data

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader
        title={invoice.invoiceNumber}
        description={`${invoice.customerName} · from sale ${invoice.saleReference}`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </Button>
            {!invoice.sentAt && invoice.status !== 'cancelled' && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await markSent.mutateAsync(invoice.id)
                  showToast('Invoice marked as sent.', 'success')
                }}
              >
                <Send size={14} /> Mark sent
              </Button>
            )}
            {(invoice.status === 'unpaid' || invoice.status === 'partially_paid') && (
              <Button
                onClick={async () => {
                  try {
                    await markPaid.mutateAsync(invoice.id)
                    showToast('Invoice marked as paid.', 'success')
                  } catch (err) {
                    setActionError(err instanceof InvalidInvoiceTransitionError ? err.message : 'Could not update this invoice.')
                  }
                }}
              >
                <CheckCircle2 size={14} /> Mark paid
              </Button>
            )}
            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
              <Button
                variant="danger"
                onClick={async () => {
                  const reason = window.prompt('Reason for cancelling this invoice?')
                  if (!reason) return
                  try {
                    await cancelInvoice.mutateAsync({ id: invoice.id, reason })
                    showToast('Invoice cancelled.', 'success')
                  } catch (err) {
                    setActionError(err instanceof InvalidInvoiceTransitionError ? err.message : 'Could not cancel this invoice.')
                  }
                }}
              >
                <XCircle size={14} /> Cancel
              </Button>
            )}
          </div>
        }
      />

      {actionError && <p className="mb-4 text-sm text-brand-red-700">{actionError}</p>}

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
        {invoice.dueDate && <span className="text-xs text-ink-500">Due {new Date(invoice.dueDate).toLocaleDateString('en-UG')}</span>}
        {invoice.sentAt && <span className="text-xs text-ink-500">Sent {formatRelativeTime(invoice.sentAt)}</span>}
        {invoice.paidAt && <span className="text-xs text-ink-500">Paid {formatRelativeTime(invoice.paidAt)}</span>}
      </div>
      {invoice.cancelReason && <p className="mb-4 text-xs text-brand-red-700">Cancelled: {invoice.cancelReason}</p>}

      <Card className="p-6">
        {settings?.showLogo !== false && (
          <p className="mb-1 text-center text-base font-bold text-ink-900">{businessProfileQuery.data?.businessName ?? 'ImageCare'}</p>
        )}
        <p className="text-center text-xs text-ink-500">Invoice {invoice.invoiceNumber}</p>
        <p className="text-center text-xs text-ink-500">{new Date(invoice.issuedAt).toLocaleDateString('en-UG')}</p>

        <div className="my-4 border-t border-dashed border-ink-200" />

        <ul className="space-y-1.5 text-sm">
          {invoice.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-ink-700">
                {item.quantity} × {item.productName}
              </span>
              <span className="shrink-0 text-ink-900">{formatCurrency(item.lineTotal, 'UGX')}</span>
            </li>
          ))}
        </ul>

        <div className="my-4 border-t border-dashed border-ink-200" />

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-ink-500">
            <span>Subtotal</span>
            <span>{formatCurrency(invoice.subtotal, 'UGX')}</span>
          </div>
          {invoice.discountAmount > 0 && (
            <div className="flex justify-between text-brand-red-700">
              <span>Discount</span>
              <span>-{formatCurrency(invoice.discountAmount, 'UGX')}</span>
            </div>
          )}
          {settings?.showTaxBreakdown !== false && invoice.taxAmount > 0 && (
            <div className="flex justify-between text-ink-500">
              <span>Tax</span>
              <span>{formatCurrency(invoice.taxAmount, 'UGX')}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-100 pt-1 text-base font-semibold text-ink-900">
            <span>Total</span>
            <span>{formatCurrency(invoice.totalAmount, 'UGX')}</span>
          </div>
          <div className="flex justify-between text-xs text-ink-500">
            <span>Payment method</span>
            <span className="capitalize">{invoice.paymentMethod.replace('_', ' ')}</span>
          </div>
        </div>

        {settings?.footerText && (
          <>
            <div className="my-4 border-t border-dashed border-ink-200" />
            <p className="text-center text-xs text-ink-500">{settings.footerText}</p>
          </>
        )}
      </Card>
    </div>
  )
}
