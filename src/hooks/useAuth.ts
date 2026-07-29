import type { AuthedUser } from '../types/domain'

// NOTE: IMP-001 scope is the Dashboard module only, and "Existing
// authentication" is explicitly out of bounds to change. There is no
// authentication module yet (none of IMC-000/001/002/003 define one), so
// this hook returns a fixed signed-in user shape the Dashboard can consume.
// A real Settings/Auth module should replace this hook's internals only —
// every consumer already depends on the AuthedUser type, not on how it's
// produced, so that swap won't touch Dashboard code.
const CURRENT_USER: AuthedUser = {
  id: 'user-owner-1',
  name: 'Owner',
  role: 'owner',
  allowedBranchIds: ['branch-main', 'branch-westlands', 'branch-industrial'],
}

export function useAuth(): { user: AuthedUser } {
  return { user: CURRENT_USER }
}
