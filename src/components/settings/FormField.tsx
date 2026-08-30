import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  suffix?: ReactNode
}

// forwardRef so `{...register('name')}` (react-hook-form) can attach its
// ref to the actual <input>. Without this, React silently drops the ref
// with a console warning and react-hook-form loses the ability to focus
// the first invalid field after a failed validation - every one of this
// component's ~34 call sites was affected. Everything else about the
// component (id/label association, styling, error/hint rendering) is
// unchanged.
//
// 2026-08-30 "make it bigger" pass: input padding grew from px-3.5/py-2.5
// (~40px tall) to px-4/py-3.5 (~48px tall) to land in the 44-48px
// comfortable touch-target range the user's reference screenshot uses,
// with a bigger corner radius (rounded-lg) and a touch more label spacing
// to match. Since every text-input field in the app goes through this one
// component, this single change is what makes inputs bigger everywhere
// without a per-form edit.
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, suffix, className = '', id, ...rest },
  ref,
) {
  // Guarantees the label is ALWAYS properly associated with its input,
  // even for controlled fields that pass neither `id` nor `name` (a bug
  // pattern found in several places, this fixes the root cause instead
  // of patching each call site).
  const fieldId = id ?? rest.name ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  return (
    <div>
      <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-ink-700">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          className={`w-full rounded-lg border bg-white px-4 py-3.5 text-sm text-ink-900 shadow-card transition-all duration-150 placeholder:text-ink-300 focus:border-brand-blue-500 focus:shadow-[0_0_0_3px_rgb(59_130_246_/_0.12)] focus:outline-none ${
            error ? 'border-brand-red-500' : 'border-ink-100 hover:border-ink-300'
          } ${suffix ? 'pr-10' : ''} ${className}`}
          aria-invalid={Boolean(error)}
          {...rest}
        />
        {suffix && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-ink-500">{suffix}</div>}
      </div>
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
})
