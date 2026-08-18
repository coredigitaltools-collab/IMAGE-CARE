import { useUserContext } from '../context/AppContext'
import type { AuthedUser } from '../types/domain'

// NOTE: IMP-001 scope is the Dashboard module only, and "Existing
// authentication" is explicitly out of bounds to change. There is no
// authentication module yet (none of IMC-000/001/002/003 define one), so
// this hook returns a fixed signed-in user shape the Dashboard can consume.
// A real Settings/Auth module should replace this hook's internals only,
// every consumer already depends on the AuthedUser type, not on how it's
// produced, so that swap won't touch Dashboard code.
export function useAuth(): { user: AuthedUser } {
  const ctx = useUserContext()
  return {
    user: {
      id: ctx.user_id,
      name: `${ctx.first_name} ${ctx.last_name}`.trim(),
      role: ctx.role as AuthedUser['role'],
      allowedBranchIds: ctx.is_owner
        ? ctx.branches.map(({ branch_id }) => branch_id)
        : [ctx.branch_id, ...ctx.branches.map(({ branch_id }) => branch_id)].filter((id): id is string => Boolean(id)),
    },
  }
}
