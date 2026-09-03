import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { FormField } from '../../components/settings/FormField'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useBusinessProfile, useSaveBusinessProfile } from '../../features/settings/hooks/useSettingsData'
import { SUPPORTED_CURRENCIES } from '../../lib/currency'

// Validation per IMP-002: business name is required.
// Field names below match the REAL persisted shape (imagecare.businesses:
// name/phone/email/address/currency, see settingsService.ts's
// BusinessProfile interface) - a prior version of this form used
// businessName/contactEmail/contactPhone/defaultCurrency, which PostgREST
// silently dropped on save since no such columns exist. Fixed 2026-09-02
// (save-button audit).
const schema = z.object({
  name: z.string().trim().min(1, 'Business name is required.'),
  email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
  phone: z.string().trim(),
  address: z.string().trim(),
  currency: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export function BusinessProfilePage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const profileQuery = useBusinessProfile()
  const saveMutation = useSaveBusinessProfile(user.id)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (profileQuery.data) {
      reset({
        name: profileQuery.data.name ?? '',
        email: profileQuery.data.email ?? '',
        phone: profileQuery.data.phone ?? '',
        address: profileQuery.data.address ?? '',
        currency: profileQuery.data.currency ?? SUPPORTED_CURRENCIES[0],
      })
    }
  }, [profileQuery.data, reset])

  const onSubmit = handleSubmit(async (values) => {
    try {
      await saveMutation.mutateAsync(values)
      showToast('Business profile saved.', 'success')
    } catch {
      showToast('Unable to save. Please try again.')
    }
  })

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="Business Profile" description="Shown on receipts, invoices, and reports." />

      <Card className="p-5">
        {profileQuery.isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField label="Business name" {...register('name')} error={errors.name?.message} />
            <FormField
              label="Contact email"
              type="email"
              {...register('email')}
              error={errors.email?.message}
            />
            <FormField label="Contact phone" {...register('phone')} error={errors.phone?.message} />
            <FormField label="Address" {...register('address')} error={errors.address?.message} />

            <div>
              <label htmlFor="currency" className="mb-1.5 block text-sm font-medium text-ink-700">
                Default currency
              </label>
              <select
                id="currency"
                {...register('currency')}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!isDirty || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
