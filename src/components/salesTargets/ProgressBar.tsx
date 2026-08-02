interface ProgressBarProps {
  percent: number
}

export function ProgressBar({ percent }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))
  const tone = percent >= 100 ? 'bg-success-500' : percent >= 60 ? 'bg-brand-blue-500' : 'bg-warning-500'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}
