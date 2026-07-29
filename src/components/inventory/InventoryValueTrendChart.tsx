import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import type { TrendPoint, TrendRange } from '../../services/inventoryReportsService'
import type { SupportedCurrency } from '../../lib/currency'

const RANGES: { key: TrendRange; label: string; compactLabel: string }[] = [
  { key: '7d', label: '7 days', compactLabel: '7D' },
  { key: '30d', label: '30 days', compactLabel: '30D' },
  { key: '12m', label: '12 months', compactLabel: '12M' },
]

interface InventoryValueTrendChartProps {
  data?: TrendPoint[]
  isLoading: boolean
  range: TrendRange
  onRangeChange: (range: TrendRange) => void
  currency: SupportedCurrency
  /** Compact mode fits a narrower column (e.g. a 1-of-3 grid slot):
   *  shorter chart, abbreviated range labels, no axis width padding. */
  compact?: boolean
}

export function InventoryValueTrendChart({ data, isLoading, range, onRangeChange, currency, compact }: InventoryValueTrendChartProps) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-brand-blue-700" />
          <h2 className="text-sm font-semibold text-ink-900">Inventory value trend</h2>
        </div>
        <div className="flex gap-1 rounded-md bg-ink-50 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={
                range === r.key
                  ? 'rounded px-2 py-1 text-xs font-medium bg-white text-brand-blue-700 shadow-card'
                  : 'rounded px-2 py-1 text-xs font-medium text-ink-500 hover:text-ink-900'
              }
            >
              {compact ? r.compactLabel : r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className={compact ? 'h-40 w-full' : 'h-56 w-full'} />
      ) : (
        <div className={compact ? 'h-40 w-full' : 'h-56 w-full'}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="inventoryValueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-blue-500)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-brand-blue-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--color-ink-500)' }}
                axisLine={{ stroke: 'var(--color-ink-100)' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={compact ? 30 : 15}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-ink-500)' }} axisLine={false} tickLine={false} width={0} />
              <Tooltip
                formatter={(v) => formatCurrency(Number(v ?? 0), currency)}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-ink-100)' }}
              />
              <Area type="monotone" dataKey="value" stroke="var(--color-brand-blue-700)" strokeWidth={2} fill="url(#inventoryValueFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-500">Built from real stock movement history.</p>
    </Card>
  )
}
