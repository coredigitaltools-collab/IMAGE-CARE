import type { InputHTMLAttributes, ReactNode } from 'react'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  suffix?: ReactNode
}

export function FormField({ label, error, hint, suffix, className = '', id, ...rest }: FormFieldProps) {
  const fieldId = id ?? rest.name
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-ink-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-ink-900 shadow-card transition-all duration-150 placeholder:text-ink-300 focus:border-brand-blue-500 focus:shadow-[0_0_0_3px_rgb(59_130_246_/_0.12)] focus:outline-none ${
            error ? 'border-brand-red-500' : 'border-ink-100 hover:border-ink-300'
          } ${suffix ? 'pr-10' : ''} ${className}`}
          aria-invalid={Boolean(error)}
          {...rest}
        />
        {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">{suffix}</div>}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
}
