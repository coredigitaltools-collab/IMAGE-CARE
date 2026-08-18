import { currentYear } from '../../services/annualSummaryService'

interface YearPickerProps {
  value: number
  onChange: (year: number) => void
}

export function YearPicker({ value, onChange }: YearPickerProps) {
  const thisYear = currentYear()
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)

  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500 print:hidden"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}
