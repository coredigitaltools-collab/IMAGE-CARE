import { ChevronDown, Building2 } from 'lucide-react'
import type { Branch } from '../../types/domain'

interface BranchSelectorProps {
  branches: Branch[]
  selectedBranchId: string
  onChange: (branchId: string) => void
}

/** Business rule: branch users see their own branch unless authorized (IMP-001 §7).
 *  This component itself doesn't decide permissions — it only renders the
 *  branch list its caller passes in, which the caller (Dashboard page)
 *  restricts to `user.allowedBranchIds`. */
export function BranchSelector({ branches, selectedBranchId, onChange }: BranchSelectorProps) {
  if (branches.length <= 1) return null

  return (
    <div className="relative">
      <Building2
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
        aria-hidden="true"
      />
      <select
        value={selectedBranchId}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select branch"
        className="appearance-none rounded-md border border-ink-100 bg-white py-2 pl-9 pr-8 text-sm font-medium text-ink-900 shadow-card transition-colors hover:border-ink-300 focus:border-brand-blue-500"
      >
        <option value="all">All branches</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-500"
        aria-hidden="true"
      />
    </div>
  )
}
