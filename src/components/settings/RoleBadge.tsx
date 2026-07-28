import { STAFF_ROLE_LABELS, type StaffRole } from '../../types/settings'
import { Badge } from '../ui/Badge'

const ROLE_TONE: Record<StaffRole, 'info' | 'success' | 'neutral' | 'warning'> = {
  owner: 'info',
  manager: 'success',
  cashier: 'neutral',
  accountant: 'warning',
}

export function RoleBadge({ role }: { role: StaffRole }) {
  return <Badge tone={ROLE_TONE[role]}>{STAFF_ROLE_LABELS[role]}</Badge>
}
