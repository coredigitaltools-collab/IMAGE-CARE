import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'

interface TopbarProps {
  onMenuClick: () => void
  right: ReactNode
}

export function Topbar({ onMenuClick, right }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-ink-100 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-ink-500 hover:bg-ink-50 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-3">{right}</div>
    </header>
  )
}
