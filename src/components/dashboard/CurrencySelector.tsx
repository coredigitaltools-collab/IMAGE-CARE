import { ChevronDown, Coins } from 'lucide-react'
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../lib/currency'

interface CurrencySelectorProps {
  selected: SupportedCurrency
  onChange: (currency: SupportedCurrency) => void
}

/** Lets the owner view Dashboard totals converted into any supported
 *  currency. This only affects display, the business's ledger figures
 *  stay in UGX underneath (see src/lib/currency.ts). */
export function CurrencySelector({ selected, onChange }: CurrencySelectorProps) {
  return (
    <div className="relative">
      <Coins
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
        aria-hidden="true"
      />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value as SupportedCurrency)}
        aria-label="Select reporting currency"
        className="appearance-none rounded-md border border-ink-100 bg-white py-2 pl-9 pr-8 text-sm font-medium text-ink-900 shadow-card transition-colors hover:border-ink-300 focus:border-brand-blue-500"
      >
        {SUPPORTED_CURRENCIES.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-500"
        aria-hidden="true"
      />
    </div>
  )
}
