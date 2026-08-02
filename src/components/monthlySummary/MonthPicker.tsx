import { useSearchParams } from 'react-router-dom'
import { currentMonthStr } from '../../services/monthlySummaryService'

export function useSelectedMonth(): [string, (month: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const month = searchParams.get('month') || currentMonthStr()
  const setMonth = (next: string) => setSearchParams({ month: next })
  return [month, setMonth]
}

interface MonthPickerProps {
  value: string
  onChange: (month: string) => void
}

export function MonthPicker({ value, onChange }: MonthPickerProps) {
  return (
    <input
      type="month"
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      max={currentMonthStr()}
      className="rounded-md border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500 print:hidden"
    />
  )
}
