import { OWNER_ROLE_ID } from '../../types/settings'
import { Badge } from '../ui/Badge'

interface RoleBadgeProps {
  roleId: string
  roleName: string
}

export function RoleBadge({ roleId, roleName }: RoleBadgeProps) {
  return <Badge tone={roleId === OWNER_ROLE_ID ? 'info' : 'neutral'}>{roleName}</Badge>
}
