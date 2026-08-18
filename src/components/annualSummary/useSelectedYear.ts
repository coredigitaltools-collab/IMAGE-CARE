import { useSearchParams } from 'react-router-dom'
import { currentYear } from '../../services/annualSummaryService'

export function useSelectedYear(): [number, (year: number) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const yearParam = searchParams.get('year')
  const year = yearParam ? Number(yearParam) : currentYear()
  const setYear = (next: number) => setSearchParams({ year: String(next) })
  return [year, setYear]
}
