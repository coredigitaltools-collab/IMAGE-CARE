import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface NumberFieldProps {
  id?: string
  name?: string
  label: string
  value: number
  onChange: (value: number) => void
  onBlur?: () => void
  placeholder?: string
  error?: string
  hint?: string
  suffix?: ReactNode
  min?: number
  max?: number
  /** Allow one decimal point while typing (percentages, precise costs). Off by default - most business amounts here are whole UGX. */
  allowDecimal?: boolean
  /** Allow a leading minus sign (e.g. a cash-adjustment shortfall). Off by default. */
  allowNegative?: boolean
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  /** For compact inline rows (e.g. a line-items editor) where a repeated
   *  block label per row would break the layout - `label` still becomes
   *  the input's aria-label, so it stays accessible without taking space. */
  hideLabel?: boolean
  inputClassName?: string
}

function digitsOnly(raw: string, allowDecimal: boolean): string {
  if (!allowDecimal) return raw.replace(/[^0-9]/g, '')
  let seenDot = false
  let out = ''
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (ch === '.' && !seenDot) { out += ch; seenDot = true }
  }
  return out
}

function formatDigits(digits: string, negative = false): string {
  if (!digits || digits === '.') return negative ? '-' : digits
  const [intPart, decPart] = digits.split('.')
  const formattedInt = intPart ? Number(intPart).toLocaleString('en-UG') : '0'
  const body = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt
  return negative ? `-${body}` : body
}

function toDisplay(value: number): string {
  // 0 (and NaN/undefined-ish) renders as an EMPTY field, not the digit "0" -
  // this is the fix for the "018000" bug: a genuinely-unset amount should
  // look unset (placeholder "0" shows through via CSS) so the user's first
  // keystroke starts a fresh number instead of appending to a literal 0.
  if (!value) return ''
  return formatDigits(String(Math.abs(value)), value < 0)
}

// Counts digits (not commas/dots) up to `cursorPos` in `raw`, so the same
// count can be used to re-place the cursor after the value is reformatted -
// commas shift position but never change which digit the user was next to.
function digitsBeforePosition(raw: string, cursorPos: number, allowDecimal: boolean): number {
  return digitsOnly(raw.slice(0, cursorPos), allowDecimal).length
}

function cursorForDigitCount(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9]/.test(formatted[i])) {
      seen++
      if (seen === digitCount) return i + 1
    }
  }
  return formatted.length
}

// Shared thousands-separator number input for every money/quantity/percent
// field in the app - replaces raw `<input type="number">` fields, which (a)
// never showed a comma so "150000" was unreadable at a glance, and (b) all
// defaulted their underlying state to the number 0, so a field showing "0"
// had the user typing INTO that zero (typing "18000" produced "018000")
// instead of starting fresh. Styled to match FormField exactly so it drops
// into any existing form without changing modal/dialog dimensions.
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  {
    id, name, label, value, onChange, onBlur, placeholder = '0', error, hint, suffix,
    min, max, allowDecimal = false, allowNegative = false, disabled, autoFocus, className = '',
    hideLabel = false, inputClassName = '',
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fieldId = id ?? name ?? `numfield-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

  const [display, setDisplay] = useState(() => toDisplay(value))

  // Keep the display in sync when `value` changes from outside this input
  // (edit-mode data loading, a reset, another field recomputing this one) -
  // but never fight the user while they're actively typing in it.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setDisplay(toDisplay(value))
  }, [value])

  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const cursorPos = e.target.selectionStart ?? raw.length
    const digitsBefore = digitsBeforePosition(raw, cursorPos, allowDecimal)

    const negative = allowNegative && raw.includes('-')
    const digits = digitsOnly(raw, allowDecimal)
    const formatted = formatDigits(digits, negative)
    const numericAbs = digits === '' || digits === '.' ? 0 : Number(digits)
    const numeric = negative ? -numericAbs : numericAbs

    setDisplay(formatted)
    onChange(Number.isFinite(numeric) ? numeric : 0)

    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = cursorForDigitCount(formatted, digitsBefore)
      el.setSelectionRange(pos, pos)
    })
  }

  const handleBlur = () => {
    if (typeof min === 'number' && value < min) onChange(min)
    else if (typeof max === 'number' && value > max) onChange(max)
    onBlur?.()
  }

  return (
    <div className={className}>
      {!hideLabel && (
        <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={setRefs}
          id={fieldId}
          name={name}
          type="text"
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={hideLabel ? label : undefined}
          className={
            inputClassName ||
            `w-full rounded-lg border bg-white px-4 py-3.5 text-sm text-ink-900 shadow-card transition-all duration-150 placeholder:text-ink-300 focus:border-brand-blue-500 focus:shadow-[0_0_0_3px_rgb(59_130_246_/_0.12)] focus:outline-none disabled:bg-ink-50 disabled:text-ink-400 ${
              error ? 'border-brand-red-500' : 'border-ink-100 hover:border-ink-300'
            } ${suffix ? 'pr-10' : ''}`
          }
          aria-invalid={Boolean(error)}
        />
        {suffix && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-ink-500">{suffix}</div>}
      </div>
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-brand-red-700">{error}</p>}
    </div>
  )
})
