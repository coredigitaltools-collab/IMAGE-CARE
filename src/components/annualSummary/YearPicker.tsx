import { useSearchParams } from 'react-router-dom'
import { currentYear } from '../../services/annualSummaryService'

export function useSelectedYear(): [number, (year: number) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const yearParam = searchParams.get('year')
  const year = yearParam ? Number(yearParam) : currentYear()
  const setYear = (next: number) => setSearchParams({ year: String(next) })
  return [year, setYear]
}

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
