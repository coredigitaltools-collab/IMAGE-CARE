import { useSearchParams } from 'react-router-dom'
import { todayStr } from '../../services/dailySummaryService'

export function useSelectedDate(): [string, (date: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const date = searchParams.get('date') || todayStr()
  const setDate = (next: string) => setSearchParams({ date: next })
  return [date, setDate]
}
