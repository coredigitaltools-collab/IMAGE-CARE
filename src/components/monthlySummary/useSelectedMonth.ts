import { useSearchParams } from 'react-router-dom'
import { currentMonthStr } from '../../services/monthlySummaryService'

export function useSelectedMonth(): [string, (month: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const month = searchParams.get('month') || currentMonthStr()
  const setMonth = (next: string) => setSearchParams({ month: next })
  return [month, setMonth]
}
