import { todayStr } from '../../services/dailySummaryService'

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
