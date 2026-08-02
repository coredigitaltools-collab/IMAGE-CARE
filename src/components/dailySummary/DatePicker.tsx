import { useSearchParams } from 'react-router-dom'
import { todayStr } from '../../services/dailySummaryService'

export function useSelectedDate(): [string, (date: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const date = searchParams.get('date') || todayStr()
  const setDate = (next: string) => setSearchParams({ date: next })
  return [date, setDate]
}

interface DatePickerProps {
  value: string
  onChange: (date: string) => void
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      max={todayStr()}
      className="rounded-md border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500 print:hidden"
    />
  )
}
